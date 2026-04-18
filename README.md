# 📝 HITL VLM Grading Agent — "Mirror" Professional Edition

[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![React 18](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![Gemini 3](https://img.shields.io/badge/Model-Gemini_3_Flash-orange.svg)](https://aistudio.google.com/)

**HITL VLM Grading Agent (Mirror Edition)** là hệ thống hỗ trợ chấm điểm bài tập tự luận thông minh, kết hợp sức mạnh của Vision-Language Models (VLM) thế hệ mới (**Gemini 3 Flash**) và quy trình kiểm soát của con người (Human-in-the-loop).

Hệ thống được thiết kế dưới dạng **Professional Desk** với quy trình làm việc tối ưu, giúp giáo viên không chỉ chấm bài nhanh hơn mà còn có thể "dạy" AI học theo phong cách chấm điểm cá nhân của mình.

---

## ✨ Điểm nổi bật phiên bản Professional

- 🏗️ **Wizard Workflow (5 Bước):** Quy trình chấm điểm tiêu chuẩn: Tải lên → AI Phân tích → Giáo viên Review → Tinh chỉnh (HITL) → Hoàn tất.
- 📄 **VLM Multimodal mạnh mẽ:** Nhận diện và phân tích trực tiếp từ ảnh chụp bài làm (chữ in & viết tay) hoặc tệp PDF. Khả năng đọc hiểu sơ đồ tư duy, công thức toán học và biểu đồ.
- 🧠 **Hệ thống Bộ nhớ RAG (Learning from Feedback):** Sử dụng SQLite + ChromaDB để lưu trữ nhận xét của giáo viên. AI sẽ tự động tra cứu các bài học cũ để áp dụng cho các bài làm mới cùng chủ đề.
- 🔄 **Vòng lặp Chấm lại (Iterative Re-grading):** Giáo viên có thể yêu cầu AI chấm lại kèm phản hồi chi tiết. AI sẽ sử dụng phản hồi này như một ràng buộc (Constraint) hàng đầu để sửa đổi kết quả.

---

## 🔥 Quy trình 5 Bước Chuyên nghiệp

1.  **Bước 1: Tiếp nhận (Upload):** Giáo viên tải tệp (Ảnh/PDF). Hệ thống cung cấp bản xem trước trực quan.
2.  **Bước 2: Phân tích (Reading):** VLM (Gemini 3 Flash) quét nội dung, nhận diện chữ viết và áp dụng Rubric.
3.  **Bước 3: Thẩm định (Review):** Hiển thị điểm số và nhận xét chi tiết từng câu. Giáo viên có quyền: **Duyệt**, **Yêu cầu chấm lại**, hoặc **Từ chối**.
4.  **Bước 4: Tinh chỉnh (Refine):** Nếu có yêu cầu chấm lại, AI sẽ soi chiếu lại bài làm dựa trên ý kiến giáo viên để đưa ra bản chấm mới. Phản hồi này được lưu vào bộ nhớ để "huấn luyện" AI.
5.  **Bước 5: Hoàn tất (Finalize):** Kết quả cuối cùng được đóng gói chuyên nghiệp, sẵn sàng để lưu trữ hoặc xuất dữ liệu.

---

## 🛠️ Cấu trúc dự án

```text
project/
├── backend/
│   ├── main.py                # API FastAPI & Điều phối hệ thống
│   ├── agent.py               # Orchestrator quản lý VLM & Retry logic
│   ├── prompt_orchestrator.py # Xây dựng Prompt động & Tích hợp bài học
│   ├── memory.py              # Quản lý bộ nhớ kép (SQLite + ChromaDB)
│   └── data/                  # Lưu trữ DB và Logs hệ thống
├── frontend/
│   ├── src/HITLEditor.jsx     # Giao diện chính (Wizard UI)
│   └── src/components/        # Các module giao diện Stitch
├── start.bat                  # Script khởi chạy nhanh cho Windows
└── README_SETUP.md            # Hướng dẫn cài đặt kỹ thuật
```

---

_Dự án nghiên cứu: "Tác tử AI hỗ trợ chấm điểm tự luận đa phương thức kết hợp phản hồi từ giáo viên (Human-in-the-loop VLM Grading Agent)"._
