import { useEffect, useState } from "react";
import { T } from "../../theme/tokens";
import { InlineLoader } from "../../components/ui/InlineLoader";
import { getOverview, type Overview, type OverviewUserRow } from "../../api/authApi";
import { errText, fmtNum, fmtQuota } from "./adminFormat";
import { cardStyle, sectionTitleStyle, tableStyle, tdStyle, thStyle, titleStyle } from "./adminStyles";
import {
  Banner,
  FormInput,
  Pager,
  StatCard,
  StatusBadge,
  TableRow,
  UserIdentity,
} from "./adminPrimitives";

export function OverviewSection() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOverview()
      .then(setData)
      .catch((err) => setError(errText(err, "Không tải được số liệu.")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[5] }}>
      <h1 style={titleStyle}>Tổng quan hệ thống</h1>
      {error && <Banner text={error} />}
      {loading ? (
        <InlineLoader />
      ) : data ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: T.space[4],
            }}
          >
            <StatCard label="Tài khoản" value={data.total_accounts} icon="User" accentColor={T.accent} softBg={T.accentSoft} />
            <StatCard label="Giáo viên" value={data.total_teachers} icon="Award" accentColor={T.amber} softBg={T.amberSoft} />
            <StatCard label="Tổng bài đã chấm" value={data.total_graded} icon="FileText" accentColor={T.green} softBg={T.greenSoft} />
            <StatCard label="Tổng lessons đã học" value={data.total_lessons} icon="Lightbulb" accentColor={T.memory} softBg={T.memorySoft} />
          </div>

          <TeacherActivityTable users={data.users} />
        </>
      ) : null}
    </div>
  );
}

// "Hoạt động theo giáo viên" table — search + pagination so a 40-teacher
// roster doesn't become an endless scroll. Filter reuses the SAME fields as
// the Quản lý tài khoản search (tên / mã GV / username) for muscle-memory
// consistency; both are client-side (the overview payload is already loaded).
const TEACHER_PAGE_SIZE = 15;

function TeacherActivityTable({ users }: { users: OverviewUserRow[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) =>
        [u.username, u.full_name, u.teacher_code].some((f) =>
          (f || "").toLowerCase().includes(q),
        ),
      )
    : users;

  const totalPages = Math.max(1, Math.ceil(filtered.length / TEACHER_PAGE_SIZE));
  // Clamp: if the filter shrinks the list below the current page, snap back
  // so we never render an empty page mid-roster.
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * TEACHER_PAGE_SIZE;
  const pageRows = filtered.slice(start, start + TEACHER_PAGE_SIZE);

  return (
    <div style={{ ...cardStyle, width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: T.space[3],
          flexWrap: "wrap",
          marginBottom: 4,
        }}
      >
        <div style={{ ...sectionTitleStyle, fontSize: T.fontSize.base, color: T.text }}>
          Hoạt động theo giáo viên ({filtered.length})
        </div>
        <FormInput
          value={query}
          // Reset to page 1 on every keystroke so the matches are visible
          // instead of stranded on a now-out-of-range page.
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Tìm theo tên, mã GV, tên đăng nhập…"
          style={{ minWidth: 0, width: "100%", maxWidth: 300 }}
        />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ textAlign: "left", color: T.textMute }}>
              <th style={thStyle}>Tài khoản</th>
              <th style={thStyle}>Vai trò</th>
              <th style={thStyle}>Trạng thái</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Bài đã chấm</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Lessons</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Token đã dùng (30 ngày)</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Hạn mức token</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: T.textMute }}>
                  {q ? `Không có giáo viên khớp “${query.trim()}”.` : "Chưa có dữ liệu."}
                </td>
              </tr>
            ) : (
              pageRows.map((u, idx) => {
                const over = !!u.token_quota && u.token_quota > 0 && u.tokens_used >= u.token_quota;
                return (
                  <TableRow key={u.id} isEven={idx % 2 === 0}>
                    <td style={tdStyle}><UserIdentity user={u} /></td>
                    <td style={tdStyle}>{u.role === "admin" ? "Admin" : "Giáo viên"}</td>
                    <td style={tdStyle}>
                      <StatusBadge active={!!u.is_active} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{u.graded}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{u.lessons}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: over ? T.red : T.text }}>
                      {fmtNum(u.tokens_used)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: T.textMute }}>
                      {fmtQuota(u.token_quota)}
                    </td>
                  </TableRow>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <Pager page={safePage} totalPages={totalPages} onPage={setPage} />
      )}
    </div>
  );
}
