import fs from 'node:fs';
import path from 'node:path';

import { FormatCase } from '@senhainfo/shared-utils';
import { FirebirdConnection } from './connection.js';
import type { GenerateSchemaOptions } from './types.js';

interface Relation {
  rname: string;
}

interface RelationField {
  fname: string;
  ftype: number;
}

export class GenerateSchema {
  private options: Required<GenerateSchemaOptions> = {
    destinationFolder: path.join('src', 'schemas'),
    fileName: 'fb-schema.ts',
  };

  constructor(
    private firebird: FirebirdConnection,
    options?: GenerateSchemaOptions,
  ) {
    if (options) {
      Object.assign(this.options, options);
    }
  }

  /**
   * Conecta ao banco de dados e gera as interfaces TypeScript correspondentes às tabelas
   */
  async execute(): Promise<void> {
    const query = `
      SELECT TRIM(RDB$RELATION_NAME) AS RNAME
      FROM RDB$RELATIONS
      WHERE RDB$SYSTEM_FLAG = 0
      ORDER BY RDB$RELATION_NAME
    `;

    try {
      const result = await this.firebird.execute<Relation>(query);

      const schemas: string[] = [];
      const tables: string[] = [];

      for (const rel of result) {
        const relAny = rel as unknown as Record<string, unknown>;
        const rname = ((rel.rname ?? relAny.RNAME) as string | undefined)?.trim();
        if (!rname) continue;

        const fieldQuery = `
          SELECT TRIM(RF.RDB$FIELD_NAME) AS FNAME, F.RDB$FIELD_TYPE AS FTYPE
          FROM RDB$RELATION_FIELDS RF
          JOIN RDB$FIELDS F ON F.RDB$FIELD_NAME = RF.RDB$FIELD_SOURCE
          WHERE RF.RDB$RELATION_NAME = ?
          ORDER BY RF.RDB$FIELD_POSITION
        `;

        const relationFields = await this.firebird.execute<RelationField>(fieldQuery, [rname]);

        const fields: { name: string; type: string }[] = [];

        for (const rf of relationFields) {
          const rfAny = rf as unknown as Record<string, unknown>;
          const fname = ((rf.fname ?? rfAny.FNAME) as string | undefined)?.trim();
          const ftype = ((rf.ftype ?? rfAny.FTYPE) as number | undefined) ?? 0;

          if (fname) {
            fields.push({
              name: fname,
              type: this.getFieldType(ftype),
            });
          }
        }

        const formatCase = new FormatCase();
        const interfaceName = formatCase.toPascalCase(rname);
        const fieldsMap = fields.map(({ name, type }) => `${name.toLowerCase()}: ${type};`).join('\n  ');
        const content = `/**\n * Tabela: ${rname}\n */\nexport interface ${interfaceName} {\n  ${fieldsMap}\n}\n`;

        schemas.push(content);

        const table = `${rname.toLowerCase()}: {} as ${interfaceName},`;

        tables.push(table);
      }

      const destination = this.options.destinationFolder;
      await fs.promises.mkdir(destination, { recursive: true });

      const schemasPath = path.join(destination, this.options.fileName);

      const fileContent = [
        '/* Auto generated, do not edit */\n',
        schemas.join('\n'),
        '\nexport const tables = {\n',
        `  ${tables.join('\n  ')}`,
        '\n} as const;\n',
        '\nexport type Tables = keyof typeof tables;\n',
      ].join('');

      await fs.promises.writeFile(schemasPath, fileContent, 'utf-8');

      console.info('\n✓ Firebird schema generated successfully!\n');
    } catch (error) {
      console.error(`\n✕ An error occurred while generating Firebird schema: ${error}\n`);
      throw error;
    }
  }

  private getFieldType(fieldType: number): string {
    switch (fieldType) {
      case 7: // Smallint
      case 8: // Integer
      case 10: // Float
      case 16: // Bigint
      case 27: // Double Precision
        return 'number';
      case 12: // Date
      case 13: // Time
      case 35: // Timestamp
        return 'Date';
      case 14: // Char
      case 37: // Varchar
      case 261: // Blob
        return 'string';
      case 23: // Boolean (Firebird 3.0+)
        return 'boolean';
      default: // Unknown
        return 'never';
    }
  }
}
