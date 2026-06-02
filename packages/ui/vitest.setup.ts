// jsdom does not implement CSS.escape, which react-aria's selectable-collection
// keyboard delegate relies on to build item selectors during arrow-key
// navigation. Without it, useMenu/useSelectableCollection throws under test.
// Spec-compliant implementation per https://drafts.csswg.org/cssom/#serialize-an-identifier
if (typeof globalThis.CSS === "undefined") {
  // @ts-expect-error — minimal CSS shim for jsdom
  globalThis.CSS = {};
}

if (typeof globalThis.CSS.escape !== "function") {
  globalThis.CSS.escape = (value: string): string => {
    const string = String(value);
    const length = string.length;
    let index = -1;
    let codeUnit: number;
    let result = "";
    const firstCodeUnit = string.charCodeAt(0);

    while (++index < length) {
      codeUnit = string.charCodeAt(index);

      if (codeUnit === 0x0000) {
        result += "�";
        continue;
      }

      if (
        (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
        codeUnit === 0x007f ||
        (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
        (index === 1 &&
          codeUnit >= 0x0030 &&
          codeUnit <= 0x0039 &&
          firstCodeUnit === 0x002d)
      ) {
        result += "\\" + codeUnit.toString(16) + " ";
        continue;
      }

      if (index === 0 && length === 1 && codeUnit === 0x002d) {
        result += "\\" + string.charAt(index);
        continue;
      }

      if (
        codeUnit >= 0x0080 ||
        codeUnit === 0x002d ||
        codeUnit === 0x005f ||
        (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
        (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
        (codeUnit >= 0x0061 && codeUnit <= 0x007a)
      ) {
        result += string.charAt(index);
        continue;
      }

      result += "\\" + string.charAt(index);
    }

    return result;
  };
}
