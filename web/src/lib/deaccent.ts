// Mesma normalizacao do pipeline Python: remove acentos e baixa a caixa, para que
// "pocao" case com "Poção". NFD separa o acento em diacritico combinante (U+0300-036F),
// que entao removemos.
const COMBINING = /[̀-ͯ]/g;

export function deaccent(text: string): string {
  return text.normalize("NFD").replace(COMBINING, "").toLowerCase();
}
