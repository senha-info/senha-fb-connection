import { FirebirdConnection } from './connection';

interface GetSearchTermsRequest<T> {
  search?: string;
  primaryKey?: keyof T;
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
    if (!search) {
      return '';
    }

    const splittedSearch = search.split(' ');
    const searchAttributes: string[] = [];

    let searchTerms = '';

    for await (const attribute of attributes) {
      searchAttributes.push(`coalesce(${attribute as string}, '')`);
    }

    const searchAttributesText = searchAttributes.join("\n\t|| ' ' ||\n\t");

    splittedSearch.forEach((word, index) => {
      searchTerms += `upper(cast(${searchAttributesText} as VARCHAR5000)) like '%${word.toUpperCase()}%'`;

      if (index !== splittedSearch.length - 1) {
        searchTerms += ' and ';
      }
    });

    let text = `(${searchTerms})`;

    if (primaryKey) {
      text = ` and upper(${primaryKey as string}) = upper(${this.firebird.escape(search)})`;
    }

    return `(${text})`;
  }
}
