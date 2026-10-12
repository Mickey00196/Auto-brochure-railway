"""Turn a sample brochure (.docx or .txt pasted from the listing) into the HTML
shape funda in business renders, so the extension's extractor can be run on it.

Description lines become <p>. Everything after a "Kenmerken" line becomes
<dl><dt>label</dt><dd>value</dd>, with funda's section headings as <h3> —
the label/value rows a real listing page has. Usage:

    python3 brochure_to_html.py samples/foo.docx samples/foo.html
"""
import html
import sys

SECTIONS = {"Overdracht", "Bouw", "Oppervlakten", "Indeling", "Energie", "Omgeving"}


def read_lines(path):
    if path.endswith(".docx"):
        import docx  # python-docx

        doc = docx.Document(path)
        raw = [line for p in doc.paragraphs for line in p.text.split("\n")]
    else:
        raw = open(path, encoding="utf-8").read().split("\n")
    return [line.strip() for line in raw if line.strip()]


def to_html(lines):
    e = html.escape
    if "Kenmerken" in lines:
        k = lines.index("Kenmerken")
        desc, ken = lines[:k], lines[k + 1 :]
    else:
        desc, ken = lines, []
    parts, dl, i = [], [], 0
    while i < len(ken):
        if ken[i] in SECTIONS:
            if dl:
                parts.append("<dl>" + "".join(dl) + "</dl>")
                dl = []
            parts.append(f"<h3>{e(ken[i])}</h3>")
            i += 1
            continue
        value = e(ken[i + 1]) if i + 1 < len(ken) else ""
        dl.append(f"<dt>{e(ken[i])}</dt><dd>{value}</dd>")
        i += 2
    if dl:
        parts.append("<dl>" + "".join(dl) + "</dl>")
    body = f"<h1>{e(desc[0])}</h1>" + "".join(f"<p>{e(line)}</p>" for line in desc[1:])
    if ken:
        body += "<h2>Kenmerken</h2>" + "".join(parts)
    return (
        f'<!DOCTYPE html><html><head><meta charset="utf-8"><title>{e(desc[0])}</title></head>'
        f"<body>{body}</body></html>\n"
    )


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    with open(dst, "w", encoding="utf-8") as f:
        f.write(to_html(read_lines(src)))
