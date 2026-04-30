# 📝 HITL VLM Grading Agent — "Mirror" Professional Edition

[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![React 18](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![Gemini 1.5 Pro](https://img.shields.io/badge/Model-Gemini_1.5_Pro-orange.svg)](https://aistudio.google.com/)

**HITL VLM Grading Agent** là hệ thống hỗ trợ chấm điểm bài tập tự luận thông minh, kết hợp sức mạnh của Vision-Language Models (VLM) thế hệ mới (**Gemini 1.5 Pro**) và quy trình kiểm soát của con người (Human-in-the-loop).

Hệ thống được thiết kế dành riêng cho các môn STEM (Toán, Tin học, Vật lý), giúp giáo viên không chỉ chấm bài nhanh hơn mà còn có thể "huấn luyện" AI học theo phong cách chấm điểm cá nhân của mình thông qua cơ chế RAG (Retrieval-Augmented Generation).

---

## ✨ Điểm nổi bật phiên bản Professional

- 🧠 **Đa môn học STEM (Math/CS/Phys):** Hệ thống tự động nhận diện môn học dựa trên từ khóa (Keyword Scoring) để áp dụng bộ quy tắc chấm điểm chuyên biệt (Rule 8 & 9).
- 📸 **Thị giác máy tính (VLM vs OCR):** Không sử dụng OCR truyền thống. VLM hiểu được bố cục, nét gạch xóa và các ký hiệu toán học phức tạp trực tiếp từ hình ảnh/PDF (xử lý qua PyMuPDF & Pillow).
- 🧬 **Đối soát nguyên văn (Transparent Transcript):** Chế độ "Photocopy" ép AI phải chép lại y hệt bài làm của học sinh, tạo ra một lớp bằng chứng đối soát (Legal Evidence Layer) giúp giáo viên dễ dàng kiểm tra tính chính xác của AI.
- 🏗️ **Bộ nhớ tri thức RAG (Feedback Priority):** Sử dụng SQLite + ChromaDB. Các bài học được ưu tiên dựa trên `feedback_score` (0.0 - 5.0). Những lỗi giáo viên từng bác bỏ (Reject) sẽ được AI ưu tiên ghi nhớ hàng đầu.
- 🔄 **Vòng lặp HITL (Human-in-the-loop):** Quy trình 5 bước: Tải lên → AI Phân tích → Giáo viên Review → Tinh chỉnh (Nếu cần) → Hoàn tất & Lưu bài học.
- 🚀 **Xử lý ngữ cảnh lớn:** Hỗ trợ đầu ra lên đến 32,768 tokens, đảm bảo không bị cắt cụt nội dung đối với các bài luận dài hoặc các bài giải toán chi tiết.

---

## 🛠️ Cấu trúc hệ thống (Architecture)

Hệ thống được xây dựng theo mô hình **Modular Domain-Driven**, giúp tách biệt rõ ràng giữa logic chấm điểm, bộ nhớ và giao diện.

```text
project/
├── backend/                              # FastAPI Backend
│   ├── main.py                           # Cổng tiếp nhận (API Endpoints)
│   ├── api/                              # Lớp định nghĩa dữ liệu (Schemas)
│   ├── grading/                          # Tác tử chấm điểm (Core logic)
│   │   ├── agent.py                      #   Điều phối luồng chấm điểm
│   │   ├── vlm_client.py                 #   Kết nối Gemini (Retry/Rotation)
│   │   ├── file_processor.py             #   Xử lý ảnh (Pillow) & PDF (PyMuPDF)
│   │   └── prompt_orchestrator.py        #   Lắp ráp Prompt & Nhồi bài học RAG
│   ├── memory/                           # Lưu trữ & Trí nhớ dài hạn
│   │   ├── store.py                      #   Quản lý SQLite & Vector DB (ChromaDB)
│   │   └── logger.py                     #   Nhật ký sự kiện (Audit Log)
│   ├── prompts/                          # Kho tri thức của AI (Rules 1-10)
│   │   ├── base.py                       #   Quy tắc chung & Vai trò Giáo viên
│   │   ├── math.py / cs.py / phys.py      #   Quy tắc riêng từng môn học
│   │   └── __init__.py                   #   Bộ lọc môn học tự động
├── frontend/                             # React 18 + Vite + TypeScript
│       └── vite-env.d.ts
├── package.json                          # Entry point root: npm run dev
├── scripts/dev.cjs                       # Spawn backend + frontend song song (dev)
├── test/                                 # Fixtures: test/cs/ + test/math/ (PDF đề + đáp án)
└── README_SETUP.md                       # Hướng dẫn cài đặt kỹ thuật
```

---

_Dự án nghiên cứu: "Tác tử AI hỗ trợ chấm điểm tự luận đa phương thức kết hợp phản hồi từ giáo viên (Human-in-the-loop VLM Grading Agent)"._
