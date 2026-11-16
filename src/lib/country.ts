const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
let countries: Map<string, string> | undefined;
export function countryFlag(name: string): string | undefined {
  if (!countries) {
    countries = new Map(Object.entries({ uae: "AE", ksa: "SA", uk: "GB", usa: "US", unitedstatesofamerica: "US", turkey: "TR", southkorea: "KR", northkorea: "KP", czechrepublic: "CZ" }));
    const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b), label = names.of(code);
      if (label && code !== "ZZ") {
        // Locale aliases such as UK resolve to GB before building the emoji.
        const canonical = new Intl.Locale(`und-${code}`).region || code;
        countries.set(normalize(label), canonical); countries.set(code.toLowerCase(), canonical);
      }
    }
  }
  const code = countries.get(normalize(name));
  return code ? [...code].map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join("") : undefined;
}

