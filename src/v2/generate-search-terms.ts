import { FirebirdConnection } from './connection.js';
import type { GetSearchTermsRequest } from './types.js';

/**
 * Utility class for generating multi-field text search SQL conditions.
 */
export class GenerateSearchTerms {
  /**
   * Creates a new GenerateSearchTerms instance.
   *
   * @param firebird Active FirebirdConnection instance.
   */
  constructor(private firebird: FirebirdConnection) {}

  /**
   * Generates a SQL WHERE condition for multi-attribute text search across specified columns.
   * Concatenates columns into a VARCHAR5000 cast and checks case-insensitive word matching.
   *
   * @template T Entity type containing the searched attributes.
   * @param request Search request parameters including search terms, attributes, and optional primary key.
   * @returns SQL search condition string or an empty string if no search terms provided.
   */
  public execute<T>({ search, primaryKey, attributes, minWordLength = 3 }: GetSearchTermsRequest<T>): string {
    if (!search || !search.trim()) {
      return '';
    }

    const words = search.trim().split(/\s+/);

    // Filter terms shorter than minWordLength (e.g. short prepositions),
    // unless all words in the search query are short
    const filteredWords = words.filter((w) => w.length >= minWordLength);
    const wordsToSearch = filteredWords.length > 0 ? filteredWords : words;

    const concatFields = attributes.map((attr) => `coalesce(${String(attr)}, '')`).join(" || ' ' || ");
    const castExpression = `upper(cast(${concatFields} as VARCHAR5000))`;

    const searchConditions = wordsToSearch.map((word) => {
      const escapedWord = word.toUpperCase().replace(/'/g, "''");
      return `${castExpression} like '%${escapedWord}%'`;
    });

    let clause = searchConditions.join(' and ');

    if (primaryKey) {
      clause = `(${clause}) or upper(${String(primaryKey)}) = ${this.firebird.escape(search.toUpperCase())}`;
    }

    return `(${clause})`;
  }
}
