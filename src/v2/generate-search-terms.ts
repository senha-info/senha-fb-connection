import { FirebirdConnection } from './connection.js';
import type { GetSearchTermsRequest } from './types.js';

export class GenerateSearchTerms {
  constructor(private firebird: FirebirdConnection) {}

  /**
   * Gera cláusula SQL de busca textual multi-atributos
   *
   * @param request Parâmetros de pesquisa
   * @returns String contendo as condições SQL de busca
   */
  public execute<T>({ search, primaryKey, attributes, minWordLength = 3 }: GetSearchTermsRequest<T>): string {
    if (!search || !search.trim()) {
      return '';
    }

    const words = search.trim().split(/\s+/);

    // Filtra termos com tamanho menor que minWordLength (ex: "de", "da", "e"),
    // a menos que todas as palavras digitadas sejam curtas
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

