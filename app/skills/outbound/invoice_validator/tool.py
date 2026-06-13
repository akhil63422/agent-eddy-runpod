class InvoiceValidatorTool:
    REQUIRED_ROOT = ["invoice_number", "invoice_date", "buyer", "supplier"]
    REQUIRED_ITEM = ["product_id", "quantity", "unit_price"]

    def validate(self, data: dict) -> list[str]:
        errors = []
        for field in self.REQUIRED_ROOT:
            if not data.get(field):
                errors.append(f"Missing required field: {field}")
        items = data.get("items", [])
        if not items:
            errors.append("At least one line item is required")
        else:
            for i, item in enumerate(items):
                for field in self.REQUIRED_ITEM:
                    if item.get(field) is None:
                        errors.append(f"Item {i + 1}: missing required field: {field}")
        return errors
