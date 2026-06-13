import pytest
from app.skills.parser.tool import X12ParserTool, JSONParserTool, CSVParserTool

X12_850 = (
    "ISA*00*          *00*          *ZZ*BUYER001       *ZZ*SUPPLIER01     *230101*1200*^*00501*000000001*0*P*>~"
    "GS*PO*BUYER001*SUPPLIER01*20230101*1200*1*X*005010~"
    "ST*850*0001~"
    "BEG*00*NE*PO-12345**20230101~"
    "N1*BY*ACME CORP~"
    "N1*SE*WIDGET CO~"
    "PO1*1*10*EA*25.00**VP*WIDGET-100~"
    "TDS*25000~"
    "SE*8*0001~"
    "GE*1*1~"
    "IEA*1*000000001~"
)


def test_x12_850_parse():
    tool = X12ParserTool()
    tx_type, data = tool.parse(X12_850)
    assert tx_type == "PURCHASE_ORDER"
    assert data["po_number"] == "PO-12345"
    assert data["buyer"] == "ACME CORP"
    assert data["supplier"] == "WIDGET CO"
    assert len(data["line_items"]) == 1


def test_json_parse():
    tool = JSONParserTool()
    raw = '{"transaction_type": "INVOICE", "invoice_number": "INV-999", "total_amount": 500}'
    tx_type, data = tool.parse(raw)
    assert tx_type == "INVOICE"
    assert data["invoice_number"] == "INV-999"


def test_csv_parse():
    tool = CSVParserTool()
    raw = "po_number,buyer,supplier,quantity\nPO-001,ACME,Widget Co,5"
    tx_type, data = tool.parse(raw)
    assert tx_type == "PURCHASE_ORDER"
    assert data["rows"][0]["po_number"] == "PO-001"
