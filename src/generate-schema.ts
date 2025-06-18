import fs from "node:fs";
import path from "node:path";

import { executePromise, FormatCase } from "@senhainfo/shared-utils";
import { FirebirdConnection } from "./connection";

interface Relation {
  rname: string;
}

interface RelationField {
  fname: string;
  ftype: number;
}

export class FirebirdGenerateSchema {
  constructor(private firebird: FirebirdConnection) {}

  /**
   * Generate Firebird schema
   *
   * @param {string} [destinationFolder] Destination folder to save the generated schema
   * @returns {Promise<void>}
   */
  async execute(destinationFolder?: string): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      const query = `
        select trim(rdb$relation_name) as rname
        from rdb$relations
        where rdb$system_flag = 0
        order by rdb$relation_name
      `;

      const [result, error] = await executePromise(this.firebird.execute<Relation>(query));

      if (error) {
        console.error(`\n✕ An error occurred while generating Firebird schema ${error}\n`);
        return reject(error);
      }

      const schemas = [];
      const tables = [];

      for (const { rname } of result) {
        const query = `
          select trim(rf.rdb$field_name) as fname, f.rdb$field_type as ftype
          from rdb$relation_fields rf
          join rdb$fields f on f.rdb$field_name = rf.rdb$field_source
          where rf.rdb$relation_name = ?
          order by rf.rdb$field_position
        `;

        const [relationFields, error] = await executePromise(this.firebird.execute<RelationField>(query, [rname]));

        if (error) {
          console.error(`\n✕ An error occurred while generating Firebird schema ${error}\n`);
          return reject(error);
        }

        const fields = [];

        for (const { fname, ftype } of relationFields) {
          fields.push({
            name: fname,
            type: this.getFieldType(ftype),
          });
        }

        const formatCase = new FormatCase();
        const interfaceName = formatCase.toPascalCase(rname);
        const fieldsMap = fields.map(({ name, type }) => `${name.toLowerCase()}: ${type};`).join("\n  ");
        const content = `export interface ${interfaceName} {\n  ${fieldsMap}\n}\n`;

        schemas.push(content);

        const table = `${rname.toLowerCase()}: {} as ${interfaceName},`;

        tables.push(table);
      }

      const destination = destinationFolder ?? path.join("src", "infra", "database", "schemas");

      if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, {
          recursive: true,
        });
      }

      const schemasPath = path.join(destination, "firebird-schema.ts");

      if (fs.existsSync(schemasPath)) {
        fs.unlinkSync(schemasPath);
      }

      fs.appendFileSync(schemasPath, schemas.join("\n"));

      fs.appendFileSync(schemasPath, "\nconst tables = {\n");
      fs.appendFileSync(schemasPath, `  ${tables.join("\n  ")}`);
      fs.appendFileSync(schemasPath, "\n} as const;\n");
      fs.appendFileSync(schemasPath, "\nexport type Tables = keyof typeof tables;");

      console.info("\n✓ Firebird schema generated successfully\n");

      return resolve();
    });
  }

  private getFieldType(fieldType: number): string {
    switch (fieldType) {
      case 7: // Smallint
      case 8: // Integer
      case 16: // Bigint
      case 27: // Double Precision
        return "number";
      case 12: // Date
      case 13: // Time
        return "string";
      case 35: // Timestamp
        return "Date";
      case 37: // Varchar
      case 261: // Blob
        return "string";
      default: // Unknown
        return "never";
    }
  }
}
