import asyncio
import base64

import pytest

import grading.file_processor as file_processor


def _pdf_data_url(raw: bytes = b"%PDF-1.7\n") -> str:
    payload = base64.b64encode(raw).decode("ascii")
    return f"data:application/pdf;base64,{payload}"


def test_process_input_file_preserves_pdf_page_cap_error(monkeypatch):
    def too_many_pages(_raw: bytes):
        raise ValueError("PDF has too many pages (31; max 30).")

    monkeypatch.setattr(file_processor, "_render_pdf_pages", too_many_pages)

    with pytest.raises(ValueError, match="too many pages"):
        asyncio.run(file_processor.process_input_file(_pdf_data_url()))
