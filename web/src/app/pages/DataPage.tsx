import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FileSpreadsheet, LockKeyhole, Upload } from "lucide-react";
import { api } from "../../shared/api/client";
import { DataImportFormSchema, type DataImportForm } from "../../shared/api/schemas";
import { formatNumber } from "../../shared/lib/format";
import { ErrorState, EvidenceBadge } from "../../shared/ui";

const steps = ["فایل", "پیش‌نمایش", "تطبیق ستون", "قرارداد", "ورود"];

export function DataPage() {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [formError, setFormError] = useState("");
  const queryClient = useQueryClient();
  const workspace = useQuery({ queryKey: ["retention-workspace"], queryFn: api.retentionWorkspace });
  const form = useForm<DataImportForm>({ defaultValues: { name: "", cutoff: "", csvText: "", mapping: {}, expectedDatasetHash: "" } });
  const values = form.watch();

  const preview = useMutation({
    mutationFn: api.previewRetention,
    onSuccess: (data) => {
      form.setValue("mapping", data.mapping, { shouldDirty: true });
      form.setValue("expectedDatasetHash", data.datasetHash, { shouldDirty: true });
      setStep(2);
      setFormError("");
    },
  });
  const importMutation = useMutation({
    mutationFn: api.importRetention,
    onSuccess: async () => {
      setStep(5);
      await queryClient.invalidateQueries({ queryKey: ["retention-workspace"] });
      await queryClient.invalidateQueries({ queryKey: ["decisions"] });
    },
  });

  const requiredMapped = useMemo(
    () => preview.data?.fields.filter((field) => field.required).every((field) => Boolean(values.mapping[field.key])) ?? false,
    [preview.data?.fields, values.mapping],
  );

  async function readFile(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setFormError("حجم فایل مرورگر بیشتر از ۲ مگابایت است؛ یک برش کوچک‌تر انتخاب کنید یا مسیر Connector/VPC را به‌کار ببرید.");
      return;
    }
    form.setValue("csvText", await file.text(), { shouldValidate: true, shouldDirty: true });
    if (!form.getValues("name")) form.setValue("name", file.name.replace(/\.csv$/i, ""));
    setFileName(file.name);
    setFormError("");
  }

  function runPreview() {
    const parsed = DataImportFormSchema.safeParse(form.getValues());
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || "اطلاعات فایل کامل نیست.");
      return;
    }
    preview.mutate(parsed.data);
  }

  function confirmImport() {
    const parsed = DataImportFormSchema.safeParse(form.getValues());
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message || "قرارداد ورود کامل نیست.");
    importMutation.mutate(parsed.data);
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><span className="eyebrow">داده</span><h1>قرارداد داده</h1></div>
        <EvidenceBadge level={workspace.data?.evidence.key || "none"} label={workspace.data?.evidence.labelFa} />
      </header>

      <ol className="wizard-steps" aria-label="مراحل ورود داده">
        {steps.map((label, index) => {
          const number = index + 1;
          return (
            <li key={label} className={number === step ? "is-current" : number < step ? "is-complete" : ""} aria-current={number === step ? "step" : undefined}>
              <span>{number < step ? <Check aria-hidden="true" size={15} /> : formatNumber(number)}</span>
              <strong>{label}</strong>
            </li>
          );
        })}
      </ol>

      <section className="wizard-panel">
        {step === 1 ? (
          <div className="wizard-content">
            <div className="section-heading"><FileSpreadsheet aria-hidden="true" size={22} /><div><h2>فایل تراکنش ناشناس</h2><p>شناسه مشتری باید هش‌شده باشد؛ اطلاعات تماس مستقیم پذیرفته نمی‌شود.</p></div></div>
            <div className="form-grid">
              <label className="field"><span>نام تحلیل</span><input {...form.register("name")} placeholder="مثلاً چرخه خرید مرداد" /></label>
              <label className="field"><span>تاریخ برش (میلادی)</span><input {...form.register("cutoff")} type="date" /></label>
              <label className="file-drop full-width">
                <Upload aria-hidden="true" size={24} />
                <strong>{fileName || "انتخاب فایل CSV"}</strong>
                <span>حداکثر ۲ مگابایت؛ داده حجیم فقط از Connector/VPC</span>
                <input type="file" accept=".csv,text/csv" onChange={(event) => readFile(event.target.files?.[0])} />
              </label>
            </div>
            {formError || preview.error ? <p className="form-message is-error" role="alert">{formError || (preview.error as Error).message}</p> : null}
            <div className="wizard-actions"><button className="button button-primary" type="button" onClick={runPreview} disabled={preview.isPending}>{preview.isPending ? "در حال بررسی…" : "ساخت پیش‌نمایش"}<ArrowLeft aria-hidden="true" size={17} /></button></div>
          </div>
        ) : null}

        {step === 2 && preview.data ? (
          <div className="wizard-content">
            <div className="section-heading"><LockKeyhole aria-hidden="true" size={22} /><div><h2>پیش‌نمایش و حریم خصوصی</h2><p>{preview.data.privacy.statusFa}</p></div></div>
            <dl className="metric-strip">
              <div><dt>ردیف خوانده‌شده</dt><dd>{formatNumber(preview.data.rowCount)}</dd></div>
              <div><dt>ستون شناسایی‌شده</dt><dd>{formatNumber(preview.data.columns.length)}</dd></div>
              <div><dt>وضعیت ورود</dt><dd>{preview.data.canImport ? (preview.data.quality.status === "ready" ? "آماده ورود" : "آماده ورود؛ سطح ادعا محدود") : "نیازمند اصلاح"}</dd></div>
            </dl>
            {preview.data.privacy.blocked ? <p className="privacy-warning" role="alert"><AlertTriangle aria-hidden="true" size={18} />این فایل شامل داده‌ای است که با قرارداد حریم خصوصی سازگار نیست.</p> : null}
            {preview.data.qualityIssues.length ? <div className="quality-issues" aria-label="نتیجه ممیزی کیفیت">{preview.data.qualityIssues.map((issue) => <div key={`${issue.group}-${issue.code}`} className={`quality-issue is-${issue.group}`}><strong>{issue.group === "critical" ? "بحرانی" : issue.group === "fixable" ? "قابل اصلاح" : "پیشنهادی"}</strong><span>{issue.messageFa}</span></div>)}</div> : null}
            <div className="wizard-actions"><button className="button button-secondary" type="button" onClick={() => setStep(1)}><ArrowRight aria-hidden="true" size={17} />بازگشت</button><button className="button button-primary" type="button" disabled={preview.data.privacy.blocked} onClick={() => setStep(3)}>تطبیق ستون‌ها<ArrowLeft aria-hidden="true" size={17} /></button></div>
          </div>
        ) : null}

        {step === 3 && preview.data ? (
          <div className="wizard-content">
            <div className="section-heading"><FileSpreadsheet aria-hidden="true" size={22} /><div><h2>تطبیق ستون‌ها</h2><p>فیلدهای فنی در مرز چپ‌به‌راست نمایش داده می‌شوند.</p></div></div>
            <div className="mapping-list">
              {preview.data.fields.map((field) => (
                <label className="mapping-row" key={field.key}>
                  <span><strong>{field.labelFa}</strong><small>{field.required ? "ضروری" : "اختیاری"}</small></span>
                  <select dir="ltr" value={values.mapping[field.key] || ""} onChange={(event) => form.setValue("mapping", { ...values.mapping, [field.key]: event.target.value }, { shouldDirty: true })}>
                    <option value="">انتخاب نشده</option>
                    {preview.data?.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="wizard-actions"><button className="button button-secondary" type="button" onClick={() => setStep(2)}><ArrowRight aria-hidden="true" size={17} />بازگشت</button><button className="button button-primary" type="button" disabled={!requiredMapped} onClick={() => setStep(4)}>بازبینی قرارداد<ArrowLeft aria-hidden="true" size={17} /></button></div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="wizard-content">
            <div className="section-heading"><FileSpreadsheet aria-hidden="true" size={22} /><div><h2>بازبینی قرارداد</h2><p>ورود داده، یک نسخه تحلیلی جدید می‌سازد و تصمیم زنده اجرا نمی‌کند.</p></div></div>
            {workspace.isError ? <ErrorState error={workspace.error} onRetry={() => workspace.refetch()} /> : (
              <dl className="contract-review">
                <div><dt>تحلیل</dt><dd>{values.name}</dd></div>
                <div><dt>ردیف</dt><dd>{formatNumber(preview.data?.rowCount || 0)}</dd></div>
                <div><dt>معیار اصلی</dt><dd>{workspace.data?.metricContract.primaryMetricFa || "تعریف نشده"}</dd></div>
                <div><dt>وضعیت قرارداد معیار</dt><dd>{workspace.data?.metricContract.statusFa || "پیش‌نویس"}</dd></div>
                <div><dt>نسخه فایل</dt><dd><bdi>{preview.data?.datasetHash.slice(0, 12)}</bdi></dd></div>
                <div><dt>مجوز خودکار</dt><dd>غیرفعال</dd></div>
              </dl>
            )}
            {importMutation.error ? <p className="form-message is-error" role="alert">{(importMutation.error as Error).message}</p> : null}
            <div className="wizard-actions"><button className="button button-secondary" type="button" onClick={() => setStep(3)}><ArrowRight aria-hidden="true" size={17} />بازگشت</button><button className="button button-primary" type="button" onClick={confirmImport} disabled={importMutation.isPending}>{importMutation.isPending ? "در حال ورود…" : "تأیید و ورود"}<Check aria-hidden="true" size={17} /></button></div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="wizard-content import-complete" role="status">
            <span className="success-mark"><Check aria-hidden="true" size={24} /></span>
            <h2>نسخه داده ثبت شد</h2>
            <p>صف تصمیم برای بازبینی انسانی به‌روزرسانی شد.</p>
            <div className="wizard-actions"><a className="button button-primary" href="/app/decisions">مشاهده تصمیم‌ها<ArrowLeft aria-hidden="true" size={17} /></a><button className="button button-secondary" type="button" onClick={() => { form.reset({ name: "", cutoff: "", csvText: "", mapping: {}, expectedDatasetHash: "" }); setFileName(""); setStep(1); }}>ورود فایل دیگر</button></div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
