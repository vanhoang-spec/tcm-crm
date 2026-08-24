"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createPosition, updatePosition, type PositionState } from "./actions";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const area =
  "w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export type Option = { id: string; label: string };
export type JdBlock = {
  jdSummary: string;
  jdResponsibilities: string;
  jdRequirements: string;
  jdBenefits: string;
};
export type PositionData = JdBlock & {
  id: string;
  title: string;
  departmentId: string;
  teamId: string;
  hiringManagerStaffId: string;
  replacesStaffId: string;
};

const EMPTY_JD: JdBlock = { jdSummary: "", jdResponsibilities: "", jdRequirements: "", jdBenefits: "" };

/**
 * Mã lỗi của action → key i18n, khai TƯỜNG MINH.
 *
 * ⚠ CỐ Ý không ghép chuỗi kiểu `t("err" + code)`: key ghép lúc chạy KHÔNG được script kiểm parity
 * i18n bắt (HANDOVER 10.1 — repo đã có lần vỡ trang vì đúng kiểu này). Thiếu một mã ở bảng dưới
 * thì rơi về câu lỗi chung, không ném MISSING_MESSAGE.
 */
const ERR_KEY: Record<string, string> = {
  NO_TITLE: "errNoTitle",
  NOT_FOUND: "errNotFound",
};

/**
 * Form một vị trí tuyển dụng + JD. Dùng cho cả TẠO MỚI (position = null) và SỬA.
 *
 * ⚠ Mọi ô CHỮ đều là CONTROLLED. React 19 gọi `requestFormReset` sau MỌI lần chạy form action —
 * kể cả khi action TRẢ LỖI — nên để `defaultValue` là phần JD vừa gõ sẽ bị trả về giá trị cũ ngay
 * khi thiếu một trường bắt buộc. Bẫy này đã cắn ở KB-H2 và ở Chi phí văn phòng (HANDOVER 10.21).
 */
export function PositionEditor({
  position,
  departments,
  teams,
  staff,
  templates,
}: {
  position: PositionData | null;
  departments: Option[];
  teams: Option[];
  staff: Option[];
  templates: (JdBlock & { id: string; name: string })[];
}) {
  const t = useTranslations("settings.recruit");
  const [state, formAction, pending] = useActionState<PositionState, FormData>(
    position ? updatePosition : createPosition,
    {},
  );

  const [title, setTitle] = useState(position?.title ?? "");
  const [departmentId, setDepartmentId] = useState(position?.departmentId ?? "");
  const [teamId, setTeamId] = useState(position?.teamId ?? "");
  const [managerId, setManagerId] = useState(position?.hiringManagerStaffId ?? "");
  const [replacesId, setReplacesId] = useState(position?.replacesStaffId ?? "");
  const [jd, setJd] = useState<JdBlock>(position ?? EMPTY_JD);

  function applyTemplate(templateId: string) {
    const tpl = templates.find((x) => x.id === templateId);
    if (!tpl) return;
    setJd({
      jdSummary: tpl.jdSummary,
      jdResponsibilities: tpl.jdResponsibilities,
      jdRequirements: tpl.jdRequirements,
      jdBenefits: tpl.jdBenefits,
    });
  }

  const jdField = (key: keyof JdBlock, rows: number) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{t(key)}</span>
      <textarea
        name={key}
        rows={rows}
        value={jd[key]}
        onChange={(e) => setJd({ ...jd, [key]: e.target.value })}
        className={area}
      />
    </label>
  );

  return (
    <form action={formAction} className="space-y-3">
      {position && <input type="hidden" name="positionId" value={position.id} />}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("fieldTitle")}</span>
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} className={input} required />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("fieldDepartment")}</span>
          <select name="departmentId" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={input}>
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("fieldTeam")}</span>
          <select name="teamId" value={teamId} onChange={(e) => setTeamId(e.target.value)} className={input}>
            <option value="">—</option>
            {teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("fieldHiringManager")}</span>
          <select
            name="hiringManagerStaffId"
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            className={input}
          >
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">{t("hiringManagerHint")}</span>
        </label>

        {/*
          Vị trí tuyển để THAY một nhân sự đang làm. Người được chọn sẽ không nhìn thấy vị trí này
          lẫn ứng viên của nó — kể cả khi họ là trưởng bộ phận của chính phòng đó.
          ⚠ Là ô CHỌN TAY: app cố ý KHÔNG đoán theo tên chức danh, vì chức danh là chữ tự do và
          lệch một chữ là người bị thay VẪN đọc được hồ sơ thay chính mình.
        */}
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("fieldReplaces")}</span>
          <select name="replacesStaffId" value={replacesId} onChange={(e) => setReplacesId(e.target.value)} className={input}>
            <option value="">— {t("replacesNone")} —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-warning">{t("replacesHint")}</span>
        </label>
      </div>

      {templates.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("applyTemplate")}</span>
          <select className={input} defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">—</option>
            {templates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="space-y-2">
        {jdField("jdSummary", 3)}
        {jdField("jdResponsibilities", 5)}
        {jdField("jdRequirements", 5)}
        {jdField("jdBenefits", 3)}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "..." : position ? t("save") : t("create")}
        </button>
        {state.error && <span className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric")}</span>}
        {state.ok && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}
