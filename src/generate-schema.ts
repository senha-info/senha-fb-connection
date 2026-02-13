import fs from "node:fs";
import path from "node:path";

import { executePromise, FormatCase } from "@senhainfo/shared-utils";
import { FirebirdConnection } from "./connection";

interface GenerateSchemaOptions {
  /**
   * Folder to save generated schema file
   * @default "./src/schemas"
   */
  destinationFolder?: string;
  /**
   * Name of the generated schema file
   * @default "fb-schema.ts"
   */
  fileName?: string;
}

interface Relation {
  rname: string;
}

interface RelationField {
  fname: string;
  ftype: number;
}

export class FirebirdGenerateSchema {
  private options: Required<GenerateSchemaOptions> = {
    destinationFolder: path.join("src", "schemas"),
    fileName: "fb-schema.ts",
  };

  /**
   * Constructor
   * @param {FirebirdConnection} firebird - Firebird connection
   * @param {GenerateSchemaOptions} options - Options to generate Firebird schema
   *
   * @example
   * const generateSchema = new FirebirdGenerateSchema(firebird, { destinationFolder: "path/to/folder" });
   */
  constructor(
    private firebird: FirebirdConnection,
    options?: GenerateSchemaOptions,
  ) {
    if (options) {
      Object.assign(this.options, options);
    }
  }

  /**
   * Generate Firebird schema
   * @returns {Promise<void>}
   */
  async execute(): Promise<void> {
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
        const content = `/**\n * Tabela: ${rname}\n */\nexport interface ${interfaceName} {\n  ${fieldsMap}\n}\n`;

        schemas.push(content);

        const table = `${rname.toLowerCase()}: {} as ${interfaceName},`;

        tables.push(table);
      }

      const destination = this.options.destinationFolder;

      if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, {
          recursive: true,
        });
      }

      const schemasPath = path.join(destination, this.options.fileName);

      if (fs.existsSync(schemasPath)) {
        fs.unlinkSync(schemasPath);
      }

      fs.appendFileSync(schemasPath, "/* Auto generated, do not edit */\n");

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
      case 10: // Float
      case 16: // Bigint
      case 27: // Double Precision
        return "number";
      case 12: // Date
      case 13: // Time
      case 35: // Timestamp
        return "Date";
      case 14: // Char
      case 37: // Varchar
      case 261: // Blob
        return "string";
      default: // Unknown
        return "never";
    }
  }
}
