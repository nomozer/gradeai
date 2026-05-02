# HITL Mirror

Hệ thống hỗ trợ chấm điểm tự luận thông minh (Human-in-the-loop VLM Grading Agent) được xây dựng với React/Vite và FastAPI. Tải lên bài làm của học sinh, để AI phân tích, sau đó giáo viên kiểm duyệt kết quả và tinh chỉnh bộ quy tắc chấm điểm của AI thông qua RAG.

## Stack

- **Frontend** — React 18 + Vite + TypeScript
- **Backend** — Python 3.11+ + FastAPI
- **Storage** — SQLite (lưu trữ thông tin bài làm, điểm số) + ChromaDB (vector index cho RAG)
- **RAG** — Google Gemini API (`gemini-3-flash-preview` / `gemini-1.5-pro`)
- **Processing** — PyMuPDF + Pillow để xử lý hình ảnh và trích xuất PDF

## Project layout

```text
hitl-mirror/
├── backend/          FastAPI app, RAG, ChromaDB, logic chấm điểm
├── frontend/         Vite + React UI
├── scripts/          Các script tự động hóa
└── package.json      Package gốc để chạy script khởi động
```

## Prerequisites

- Python 3.11+
- Node.js 18+
- A Google API key (lấy tại https://aistudio.google.com/app/apikey)
- Windows OS (khuyên dùng)

## 1. Quick Start

Để khởi chạy toàn bộ hệ thống (cả backend và frontend) cùng lúc bằng script tự động:

```powershell
npm run dev
```

Lệnh này sẽ tự động khởi động backend (port 8000) và frontend (port 3000).

## 2. Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Tạo file backend/.env và điền GOOGLE_API_KEY

uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### Required env vars

File `backend/.env` cần các biến môi trường sau:

- `GOOGLE_API_KEY` — API key Google AI Studio của bạn
- `GEMINI_MODEL` — mặc định là `gemini-3-flash-preview`

## 3. Frontend

```powershell
cd frontend
npm install
npm run dev
```

App: http://localhost:3000

## Using the app

1. Mở giao diện frontend, tải lên tệp PDF hoặc hình ảnh bài làm của học sinh.
2. Chờ AI phân tích bài làm và tạo bản sao chép (Transcript).
3. Xem lại bản sao chép, điểm số và nhận xét do AI đề xuất.
4. Chỉnh sửa điểm số hoặc thêm phản hồi để dạy cho AI (quy trình Human-in-the-loop).
5. Lưu kết quả để hệ thống cập nhật vào bộ nhớ RAG, giúp AI học hỏi phong cách chấm bài của bạn.

## Architecture Highlights

- **Đa môn học STEM:** Hệ thống tự động nhận diện môn học dựa trên từ khóa để áp dụng quy tắc chấm điểm phù hợp.
- **Thị giác máy tính (VLM):** Hiểu được bố cục, nét gạch xóa và ký hiệu toán học phức tạp trực tiếp từ hình ảnh/PDF mà không dùng OCR truyền thống.
- **Đối soát nguyên văn (Transparent Transcript):** Bắt buộc AI chép lại y hệt bài làm của học sinh, tạo ra bằng chứng đối soát minh bạch.
- **Ưu tiên phản hồi (Feedback Priority):** Các bài học trong Vector DB được ưu tiên dựa trên đánh giá của giáo viên, đảm bảo AI không lặp lại lỗi đã bị bác bỏ.
