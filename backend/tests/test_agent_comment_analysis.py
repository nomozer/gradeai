import asyncio

from grading.agent import AgentOrchestrator


class TimeoutGemini:
    async def call_with_retry(self, *args, **kwargs):
        raise asyncio.TimeoutError("comment analysis timed out")


def test_analyze_teacher_comment_uses_local_fallback_on_upstream_timeout():
    orchestrator = AgentOrchestrator.__new__(AgentOrchestrator)
    orchestrator.gemini = TimeoutGemini()

    out = asyncio.run(
        orchestrator.analyze_teacher_comment(
            question="Câu 1",
            student_answer="Học sinh giải đúng phương trình.",
            teacher_comment="Bài làm tốt, cần trình bày rõ kết luận hơn.",
        )
    )

    assert out["verdict"] == "agree"
    assert out["analysis"]
    assert out["lesson"]
