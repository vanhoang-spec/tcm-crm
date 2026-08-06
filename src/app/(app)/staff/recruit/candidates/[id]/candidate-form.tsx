"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Save } from "lucide-react";
import { NumberField } from "@/components/ui/number-field";
import { DateField } from "@/components/ui/date-field";
import { parseCvWithAi, saveCandidate, type ParseState, type SaveState } from "../../actions";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-surface-2 disabled:text-muted-foreground";
const area =
  "w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-surface-2 disabled:text-muted-foreground";

export type CandidateData = {
  id: string;
  fullName: string;
  /** "YYYY-MM-DD" hoặc rỗng. */
  dob: string;
  phone: string;
  email: string;
  summaryWork: string;
  summarySkills: string;
  summaryOther: string;
  /** null = người xem không được thấy ô lương (đã bị chặn từ tầng truy vấn). */
  expectedSalary: number | null;
};

const PARSE_ERR: Record<string, string> = {
  NO_AI_PERM: "errNoAiPerm",
  NOT_FOUND: "errNotFound",
  CANNOT_READ: "errCannotRead",
  AI_FAILED: "errAiFailed",
  AI_BAD_SHAPE: "errAiBadShape",
};
const SAVE_ERR: Record<string, string> = {
  NO_NAME: "errNoName",
  NOT_FOUND: "errNotFound",
};

/**
 * Hồ sơ ứng viên: AI đọc CV điền sẵn → HR kiểm lại → Lưu.
 *
 * ⚠ Hai `useActionState` riêng và KHÔNG gộp lỗi bằng `??`: mỗi hook giữ lỗi của nó và không tự xoá
 * cho nhau, gộp lại là lỗi CŨ của thao tác này che lỗi MỚI của thao tác kia (HANDOVER 10.21).
 *
 * ⚠ MỌI ô là CONTROLLED. React 19 gọi `requestFormReset` sau mỗi lần chạy action kể cả khi action
 * trả lỗi — và ở đây còn một lý do nữa: kết quả AI phải ghi ĐƯỢC vào ô, mà ô không điều khiển thì
 * không ghi vào được.
 */
export function CandidateForm({
  candidate,
  canEdit,
  canSeeSalary,
  canAiParse,
  aiParsedAt,
}: {
  candidate: CandidateData;
  canEdit: boolean;
  canSeeSalary: boolean;
  canAiParse: boolean;
  aiParsedAt: string | null;
}) {
  const t = useTranslations("recruit");
  const [parseState, parseAction, parsing] = useActionState<ParseState, FormData>(parseCvWithAi, {});
  const [saveState, saveAction, saving] = useActionState<SaveState, FormData>(saveCandidate, {});

  // ⚠ `DateField` giữ giá trị trong state NỘI BỘ của nó và chỉ nhận `defaultValue` một lần, nên
  // không ghi vào nó bằng prop được. Muốn AI điền được ngày sinh thì phải ÉP DỰNG LẠI component
  // bằng `key` — đúng mẫu đã phải vá ở trình soạn bài KB-H3 (HANDOVER 10.14a).
  // Chỉ bump khi AI thật sự đọc ĐƯỢC ngày sinh; AI trả null thì không dựng lại, giữ nguyên thứ HR
  // đã gõ tay.
  const [dobSeed, setDobSeed] = useState(candidate.dob);
  const [dobKey, setDobKey] = useState(0);

  const [form, setForm] = useState({
    fullName: candidate.fullName,
    phone: candidate.phone,
    email: candidate.email,
    summaryWork: candidate.summaryWork,
    summarySkills: candidate.summarySkills,
    summaryOther: candidate.summaryOther,
    salary: candidate.expectedSalary ?? 0,
  });

  // Đưa kết quả AI vào form NGAY khi action trả về, bằng cách điều chỉnh state lúc render (repo
  // chặn useEffect cho việc đồng bộ này). `applied` bảo đảm chỉ áp MỘT lần cho mỗi lượt gọi —
  // không có nó thì mỗi lần render lại sẽ ghi đè phần HR vừa sửa tay.
  const [applied, setApplied] = useState<ParseState["parsed"] | null>(null);
  if (parseState.parsed && parseState.parsed !== applied) {
    const p = parseState.parsed;
    setApplied(p);
    if (p.dob) {
      setDobSeed(p.dob);
      setDobKey((k) => k + 1);
    }
    setForm((f) => ({
      ...f,
      // Chỉ ghi đè khi AI thật sự đọc được trường đó — null nghĩa là "CV không nói", không phải
      // "hãy xoá thứ HR đã gõ".
      fullName: p.fullName ?? f.fullName,
      phone: p.phone ?? f.phone,
      email: p.email ?? f.email,
      summaryWork: p.summaryWork ?? f.summaryWork,
      summarySkills: p.summarySkills ?? f.summarySkills,
      summaryOther: p.summaryOther ?? f.summaryOther,
      salary: p.expectedSalary ?? f.salary,
    }));
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const textarea = (key: "summaryWork" | "summarySkills" | "summaryOther", rows: number) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{t(key)}</span>
      <textarea
        name={key}
        rows={rows}
        value={form[key]}
        disabled={!canEdit}
        onChange={(e) => set(key, e.target.value)}
        className={area}
      />
    </label>
  );

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("basicInfo")}</h2>
        {canEdit && canAiParse && (
          <form
            action={parseAction}
            // Hộp xác nhận nói rõ dữ liệu đi đâu — CV là dữ liệu cá nhân của người NGOÀI công ty.
            onSubmit={(e) => {
              if (!window.confirm(t("confirmAiParse"))) e.preventDefault();
            }}
          >
            <input type="hidden" name="candidateId" value={candidate.id} />
            <button
              type="submit"
              disabled={parsing}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-brand-600 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {parsing ? t("aiParsing") : t("aiParse")}
            </button>
          </form>
        )}
      </div>

      {aiParsedAt && <p className="text-xs text-muted-foreground">{t("aiParsedAt", { date: aiParsedAt })}</p>}
      {parseState.error && <p className="text-xs text-danger">{t(PARSE_ERR[parseState.error] ?? "errGeneric")}</p>}
      {parseState.parsed && <p className="text-xs text-success">{t("aiParsedReview")}</p>}

      <form action={saveAction} className="space-y-3">
        <input type="hidden" name="candidateId" value={candidate.id} />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("fullName")}</span>
            <input
              name="fullName"
              value={form.fullName}
              disabled={!canEdit}
              onChange={(e) => set("fullName", e.target.value)}
              className={input}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("dob")}</span>
            <DateField key={dobKey} name="dob" defaultValue={dobSeed} disabled={!canEdit} className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("phone")}</span>
            <input
              name="phone"
              value={form.phone}
              disabled={!canEdit}
              onChange={(e) => set("phone", e.target.value)}
              className={input}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("email")}</span>
            <input
              name="email"
              value={form.email}
              disabled={!canEdit}
              onChange={(e) => set("email", e.target.value)}
              className={input}
            />
          </label>

          {/* Ô lương chỉ tồn tại khi người xem đủ điều kiện — server cũng bỏ qua trường này nếu
              người lưu không đủ điều kiện, nên không thể ghi đè bằng cách sửa HTML. */}
          {canSeeSalary && (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("expectedSalary")}</span>
              <NumberField
                name="expectedSalary"
                value={form.salary}
                disabled={!canEdit}
                onChange={(v) => set("salary", v)}
                className={input}
              />
              <span className="mt-1 block text-xs text-muted-foreground">{t("expectedSalaryHint")}</span>
            </label>
          )}
        </div>

        {textarea("summaryWork", 4)}
        {textarea("summarySkills", 4)}
        {textarea("summaryOther", 3)}

        {canEdit && (
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "..." : t("save")}
            </button>
            {saveState.error && <span className="text-xs text-danger">{t(SAVE_ERR[saveState.error] ?? "errGeneric")}</span>}
            {saveState.saved && <span className="text-xs text-success">{t("saved")}</span>}
          </div>
        )}
      </form>
    </div>
  );
}
