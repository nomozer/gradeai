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
- 📸 **Trình đối soát văn bản (Transparent Transcript):** Chế độ "Mindless Text Photocopier" kết hợp quy trình tự đối soát (Post-copy Verification) giúp AI chép lại 100% nguyên văn bài làm, bảo toàn từng lỗi chính tả, chữ viết xấu để giáo viên có bằng chứng đối soát không thể tranh cãi (Legal Evidence Layer).
- 🧬 **Hỗ trợ STEM & Ký hiệu chuyên sâu:** Nhận diện và bảo toàn chính xác các ký hiệu toán học đặc biệt (trị tuyệt đối `|x|`, số nhị phân, logic toán, chỉ số dưới/trên), đảm bảo không làm mất ý nghĩa kỹ thuật của bài làm.
- 🧠 **Hệ thống Bộ nhớ RAG (Learning from Feedback):** Sử dụng SQLite + ChromaDB để lưu trữ nhận xét của giáo viên. AI sẽ tự động tra cứu các bài học cũ để áp dụng cho các bài làm mới cùng chủ đề.
- 🤝 **Giọng điệu Mentor (Constructive Tone):** AI được cấu hình để đưa ra nhận xét với tư cách là người đồng hành tận tâm, tập trung vào việc khích lệ và gợi ý cải thiện thay vì chỉ trích lỗi sai.
- 🔄 **Vòng lặp Chấm lại (Iterative Re-grading):** Giáo viên có thể yêu cầu AI chấm lại kèm phản hồi chi tiết. AI sẽ sử dụng phản hồi này như một ràng buộc (Constraint) hàng đầu để sửa đổi kết quả.
- 🚀 **Mở rộng quy mô (Scalable context):** Hỗ trợ lên đến 16,384 tokens cho kết quả đầu ra, cho phép xử lý các bài luận dài và phức tạp mà không bị cắt cụt nội dung.

---

## 🔥 Quy trình 5 Bước Chuyên nghiệp

1.  **Bước 1: Tiếp nhận (Upload):** Giáo viên tải tệp (Ảnh/PDF). Hệ thống cung cấp bản xem trước trực quan.
2.  **Bước 2: Phân tích (Reading):** VLM (Gemini 3 Flash) quét nội dung, nhận diện chữ viết và áp dụng Rubric.
3.  **Bước 3: Thẩm định (Review):** Hiển thị điểm số và nhận xét chi tiết từng câu. Giáo viên có quyền: **Duyệt**, **Yêu cầu chấm lại**, hoặc **Từ chối**.
4.  **Bước 4: Tinh chỉnh (Refine):** Nếu có yêu cầu chấm lại, AI sẽ soi chiếu lại bài làm dựa trên ý kiến giáo viên để đưa ra bản chấm mới. Phản hồi này được lưu vào bộ nhớ để "huấn luyện" AI.
5.  **Bước 5: Hoàn tất (Finalize):** Kết quả cuối cùng được đóng gói chuyên nghiệp, sẵn sàng để lưu trữ hoặc xuất dữ liệu.

---

## 🛠️ Cấu trúc dự án

Backend đã tách theo **domain folder** (mỗi thư mục ≈ một chương báo cáo); frontend chuyển sang **TypeScript** với root composer `App.tsx` thay cho `HITLEditor.jsx` cũ.

```text
project/
├── backend/                              # FastAPI, Python 3.11+
│   ├── main.py                           # Bootstrap + 5 endpoint handlers
│   ├── api/                              # Tầng HTTP
│   │   ├── schemas.py                    #   Pydantic Request/Response (10 model)
│   │   └── heartbeat.py                  #   /api/heartbeat + watchdog auto-shutdown
│   ├── grading/                          # Tác tử chấm điểm (Gemini VLM)
│   │   ├── agent.py                      #   AgentOrchestrator + run_pipeline
│   │   ├── vlm_client.py                 #   GeminiClient + model rotation + retry
│   │   ├── file_processor.py             #   Image/PDF decode + compress + rasterize
│   │   ├── grade_parser.py               #   JSON parse + salvage + comment fallback
│   │   └── prompt_orchestrator.py        #   Prompt assembly + lesson injection
│   ├── memory/                           # Bộ nhớ HITL
│   │   ├── store.py                      #   Dual-store SQLite + ChromaDB (3-leg retrieval)
│   │   └── logger.py                     #   JSONL audit log (rotating)
│   ├── prompts/                          # System prompt theo môn
│   │   ├── base.py                       #   Persona + Rules 1–7, 9b, 10 (shared)
│   │   ├── math.py                       #   Rule 8 + 9 cho Toán
│   │   ├── cs.py                         #   Rule 8 + 9 cho Tin học
│   │   └── __init__.py                   #   Registry + detect_subject()
│   ├── data/                             # SQLite + Chroma + JSONL + prompt_logs
│   └── requirements.txt
├── frontend/                             # React 18 + Vite + TypeScript
│   ├── index.html
│   ├── tsconfig.json + vite.config.js
│   └── src/
│       ├── index.tsx + App.tsx           # Entry + root composer (Wizard 5 bước)
│       ├── api/                          # apiPost client + endpoint helpers (typed)
│       ├── components/                   # layout/ (Sidebar, AppHeader, TabBar, …)
│       │                                 # ui/ (Icon, ErrorBoundary, LoadingSpinner, …)
│       ├── features/                     # upload/ · review/ · workspace/
│       │                                 # mỗi feature = Component + .logic.ts thuần
│       ├── hooks/                        # useAgentPipeline, useFeedback, useHeartbeat,
│       │                                 # useTabs, useLang
│       ├── lib/                          # file, grade, mathFormat, tabs (helpers thuần)
│       ├── theme/ + i18n/ + types/       # Design tokens · en/vi · TS types
│       └── vite-env.d.ts
├── package.json                          # Entry point root: npm run dev
├── scripts/dev.cjs                       # Spawn backend + frontend song song (dev)
├── test/                                 # Fixtures: test/cs/ + test/math/ (PDF đề + đáp án)
└── README_SETUP.md                       # Hướng dẫn cài đặt kỹ thuật
```

---

_Dự án nghiên cứu: "Tác tử AI hỗ trợ chấm điểm tự luận đa phương thức kết hợp phản hồi từ giáo viên (Human-in-the-loop VLM Grading Agent)"._
