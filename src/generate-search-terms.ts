import { executePromise } from "@senhainfo/shared-utils";
import { escape, FirebirdConnection } from "./connection";

interface ParseAttributeProps {
  key: string;
}

interface GetSearchTermsRequest<T> {
  search?: string;
  primaryKey: keyof T;
  attributes: (keyof T)[];
}

export class GenerateSearchTerms {
  constructor(private firebird: FirebirdConnection) {}

  /**
   * Generate Firebird search terms
   *
   * @param {GetSearchTermsRequest<T>} request Request object
   * @param {string} request.search Search string
   * @param {keyof T} request.primaryKey Primary key of the table
   * @param {keyof T[]} [request.attributes] Attributes to be searched
   * @returns {Promise<string>}
   */
  async execute<T>({ search, primaryKey, attributes }: GetSearchTermsRequest<T>): Promise<string> {
    if (!search || !primaryKey) {
      return "";
    }

    const splittedSearch = search.split(" ");
    const searchAttributes: string[] = [];

    let searchTerms = "";

    for await (const attribute of attributes) {
      const parsedAttribute = await this.parseAttribute({ key: attribute as string });
      searchAttributes.push(`coalesce(${parsedAttribute}, '')`);
    }

    const searchAttributesText = searchAttributes.join("\n\t|| ' ' ||\n\t");

    splittedSearch.forEach((word, index) => {
      searchTerms += `upper(cast(${searchAttributesText} as VARCHAR5000)) like '%${word.toUpperCase()}%'`;

      if (index !== splittedSearch.length - 1) {
        searchTerms += " and ";
      }
    });

    return `upper(${primaryKey as string}) = upper(${escape(search)}) or (${searchTerms})`;
  }

  private async parseAttribute({ key }: ParseAttributeProps) {
    const query = `
      select first 1
        f.rdb$field_type ftype,
        trim(rf.rdb$field_source) fsource,
        trim(coalesce(c.rdb$collation_name, 'NONE')) cname
      from rdb$relation_fields rf
      inner join rdb$fields f on rf.rdb$field_source = f.rdb$field_name
      left join rdb$collations c on (
          c.rdb$collation_id = f.rdb$collation_id
          and
          c.rdb$character_set_id = f.rdb$character_set_id
      )
      where upper(rf.rdb$field_name) = upper(${escape(key)})
    `;

    const [fields, error] = await executePromise(
      this.firebird.execute<{ ftype: number; fsource: string; cname?: string }>(query)
    );

    if (error) {
      throw new Error(error);
    }

    const [{ ftype, fsource, cname }] = fields;

    // 37 - Varchar
    if (ftype === 37 && cname === "NONE") {
      return `cast(${key} as VARCHAR(120) character set WIN1252)`;
    }

    // 37 - Varchar
    if (ftype === 37 && !fsource.startsWith("VARCHAR")) {
      return `cast(${key} as VARCHAR(500) character set WIN1252)`;
    }

    // 261 - Blob
    if (ftype === 261) {
      return `cast(${key} as VARCHAR5000)`;
    }

    return key;
  }
}
