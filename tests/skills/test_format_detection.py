import pytest
from app.skills.format_detection.tool import FormatDetectionTool

tool = FormatDetectionTool()


def test_x12():
    assert tool.detect("ISA*00*          *00*          *ZZ*SENDER*ZZ*RECEIVER~") == "X12"


def test_json():
    assert tool.detect('{"transaction_type": "PURCHASE_ORDER"}') == "JSON"


def test_csv():
    assert tool.detect("po_number,buyer,supplier\nPO-001,ACME,Widget Co") == "CSV"


def test_idoc():
    assert tool.detect("<EDI_DC40>SNDPRN=100</EDI_DC40>") == "IDOC"


def test_xml():
    assert tool.detect('<?xml version="1.0"?><PurchaseOrder/>') == "XML"


def test_email_fallback():
    result = tool.detect("Hi, please find attached the purchase order for 100 units.")
    assert result == "EMAIL"
