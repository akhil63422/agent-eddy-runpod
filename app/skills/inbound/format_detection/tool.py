class FormatDetectionTool:
    def detect(self, raw_document: str) -> str:
        doc = raw_document.strip()

        if doc.startswith("ISA*"):
            return "X12"

        if "<EDI_DC40>" in doc or "SNDPRN" in doc:
            return "IDOC"

        if doc.startswith("<?xml") or doc.startswith("<"):
            return "XML"

        stripped = doc.lstrip()
        if stripped.startswith("{") or stripped.startswith("["):
            return "JSON"

        first_line = doc.split("\n")[0]
        if first_line.count(",") >= 2:
            return "CSV"

        return "EMAIL"
