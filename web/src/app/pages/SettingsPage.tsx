import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { api } from "../../shared/api/client";
import { SettingsFormSchema, type SettingsForm } from "../../shared/api/schemas";
import { ErrorState, LoadingState } from "../../shared/ui";

type ContractForm = {
  channelChurnDefinitionFa: string;
  eligibilityFa: string;
  grossMarginDefinitionFa: string;
  currentPolicyDescriptionFa: string;
  currentPolicyOwnerFa: string;
  actionsLogged: boolean;
  reproducible: boolean;
  crmOwnerFa: string;
  dataOwnerFa: string;
  financeOwnerFa: string;
  experimentOwnerFa: string;
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const configuration = useQuery({ queryKey: ["retention-configuration"], queryFn: api.configuration });
  const workspace = useQuery({ queryKey: ["retention-workspace"], queryFn: api.retentionWorkspace });
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const lifecycleForm = useForm<SettingsForm>();
  const contractForm = useForm<ContractForm>();
  const lifecycleMutation = useMutation({
    mutationFn: api.updateConfiguration,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["retention-configuration"] });
      await queryClient.invalidateQueries({ queryKey: ["retention-workspace"] });
    },
  });
  const contractMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.updateMetricContract(body),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["retention-workspace"] }),
  });
  const canEdit = session.data ? ["owner", "admin"].includes(session.data.role) : false;
  const contract = workspace.data?.metricContract;
  const contractLocked = contract?.status === "locked";

  useEffect(() => {
    if (!configuration.data) return;
    const config = configuration.data.configuration;
    lifecycleForm.reset({ presetKey: config.presetKey, purchaseObjectFa: config.display.purchaseObjectFa, channelFa: config.display.channelFa, ...config.lifecycle });
  }, [lifecycleForm, configuration.data]);

  useEffect(() => {
    if (!contract) return;
    contractForm.reset({
      channelChurnDefinitionFa: contract.channelChurnDefinitionFa,
      eligibilityFa: contract.eligibilityFa,
      grossMarginDefinitionFa: contract.finance.grossMarginDefinitionFa,
      currentPolicyDescriptionFa: contract.currentPolicy.descriptionFa,
      currentPolicyOwnerFa: contract.currentPolicy.ownerFa,
      actionsLogged: contract.currentPolicy.actionsLogged,
      reproducible: contract.currentPolicy.reproducible,
      crmOwnerFa: contract.owners.crmFa,
      dataOwnerFa: contract.owners.dataFa,
      financeOwnerFa: contract.owners.financeFa,
      experimentOwnerFa: contract.owners.experimentFa,
    });
  }, [contract, contractForm]);

  if (configuration.isLoading || workspace.isLoading) return <LoadingState label="در حال دریافت تنظیمات…" />;
  if (configuration.isError || workspace.isError || !configuration.data || !workspace.data) return <ErrorState error={configuration.error || workspace.error} onRetry={() => { configuration.refetch(); workspace.refetch(); }} />;

  function submitContract(action: string) {
    const values = contractForm.getValues();
    contractMutation.mutate({
      action,
      channelChurnDefinitionFa: values.channelChurnDefinitionFa,
      eligibilityFa: values.eligibilityFa,
      finance: { grossMarginDefinitionFa: values.grossMarginDefinitionFa },
      currentPolicy: {
        descriptionFa: values.currentPolicyDescriptionFa,
        ownerFa: values.currentPolicyOwnerFa,
        actionsLogged: values.actionsLogged,
        reproducible: values.reproducible,
      },
      owners: {
        crmFa: values.crmOwnerFa,
        dataFa: values.dataOwnerFa,
        financeFa: values.financeOwnerFa,
        experimentFa: values.experimentOwnerFa,
      },
    });
  }

  return (
    <div className="page-stack">
      <header className="page-header"><div><span className="eyebrow">تنظیمات</span><h1>قرارداد تصمیم</h1></div><span className="rbac-label">دسترسی: {session.data?.role || "نامشخص"}</span></header>

      <section className="settings-panel" aria-labelledby="lifecycle-title">
        <div className="section-title-row"><div><span className="eyebrow">مدل چرخه</span><h2 id="lifecycle-title">تعریف چرخه مشتری</h2></div><span>تنظیم عملیاتی</span></div>
        <form onSubmit={lifecycleForm.handleSubmit((raw) => { const parsed = SettingsFormSchema.safeParse(raw); if (parsed.success) lifecycleMutation.mutate(parsed.data); })}>
          <div className="form-grid">
            <label className="field"><span>الگوی کسب‌وکار</span><select {...lifecycleForm.register("presetKey")} disabled={!canEdit}>{configuration.data.presets.map((preset) => <option key={preset.key} value={preset.key}>{preset.labelFa}</option>)}</select></label>
            <label className="field"><span>موضوع خرید</span><input {...lifecycleForm.register("purchaseObjectFa")} disabled={!canEdit} /></label>
            <label className="field"><span>کانال اجرا</span><input {...lifecycleForm.register("channelFa")} disabled={!canEdit} /></label>
            <label className="field"><span>شروع Lapsed (روز)</span><input type="number" {...lifecycleForm.register("lapsedAfterDays")} disabled={!canEdit} /></label>
            <label className="field"><span>شروع Dormant (روز)</span><input type="number" {...lifecycleForm.register("dormantAfterDays")} disabled={!canEdit} /></label>
            <label className="field"><span>شروع Lost (روز)</span><input type="number" {...lifecycleForm.register("lostAfterDays")} disabled={!canEdit} /></label>
            <label className="field"><span>حداقل خرید تاریخی</span><input type="number" {...lifecycleForm.register("minHistoricalPurchases")} disabled={!canEdit} /></label>
          </div>
          {lifecycleMutation.error ? <p className="form-message is-error" role="alert">{(lifecycleMutation.error as Error).message}</p> : null}
          <button className="button button-primary" type="submit" disabled={!canEdit || lifecycleMutation.isPending}><Save aria-hidden="true" size={17} />ثبت چرخه</button>
        </form>
      </section>

      <section className="settings-panel" aria-labelledby="metric-contract-title">
        <div className="section-title-row"><div><span className="eyebrow">Metric Contract · نسخه {contract?.version}</span><h2 id="metric-contract-title">معیار مالی و سیاست فعلی CRM</h2></div><span className={contractLocked ? "status-locked" : ""}>{contract?.statusFa}</span></div>
        <div className="form-grid">
          <label className="field full-width"><span>تعریف Channel Churn</span><textarea rows={2} {...contractForm.register("channelChurnDefinitionFa")} disabled={!canEdit || contractLocked} /></label>
          <label className="field full-width"><span>جامعه واجد شرایط</span><textarea rows={2} {...contractForm.register("eligibilityFa")} disabled={!canEdit || contractLocked} /></label>
          <label className="field full-width"><span>تعریف حاشیه سود مورد تأیید Finance</span><input {...contractForm.register("grossMarginDefinitionFa")} disabled={!canEdit || contractLocked} /></label>
          <label className="field"><span>شرح سیاست فعلی CRM</span><input {...contractForm.register("currentPolicyDescriptionFa")} disabled={!canEdit || contractLocked} /></label>
          <label className="field"><span>مالک سیاست فعلی</span><input {...contractForm.register("currentPolicyOwnerFa")} disabled={!canEdit || contractLocked} /></label>
          <label className="check-field"><input type="checkbox" {...contractForm.register("actionsLogged")} disabled={!canEdit || contractLocked} /><span>اقدام‌های سیاست فعلی ثبت می‌شوند</span></label>
          <label className="check-field"><input type="checkbox" {...contractForm.register("reproducible")} disabled={!canEdit || contractLocked} /><span>سیاست فعلی قابل بازتولید است</span></label>
          <label className="field"><span>مالک CRM</span><input {...contractForm.register("crmOwnerFa")} disabled={!canEdit || contractLocked} /></label>
          <label className="field"><span>مالک داده</span><input {...contractForm.register("dataOwnerFa")} disabled={!canEdit || contractLocked} /></label>
          <label className="field"><span>مالک مالی</span><input {...contractForm.register("financeOwnerFa")} disabled={!canEdit || contractLocked} /></label>
          <label className="field"><span>مالک آزمایش</span><input {...contractForm.register("experimentOwnerFa")} disabled={!canEdit || contractLocked} /></label>
        </div>

        {contract?.readiness?.missingFa?.length ? <div className="contract-gaps"><strong>پیش از قفل تکمیل شود</strong><ul>{contract.readiness.missingFa.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
        {contractMutation.error ? <p className="form-message is-error" role="alert">{(contractMutation.error as Error).message}</p> : null}
        {contractMutation.isSuccess ? <p className="form-message is-success" role="status">قرارداد معیار به‌روزرسانی شد.</p> : null}

        <div className="contract-actions">
          {contractLocked ? <button className="button button-secondary" type="button" disabled={!canEdit || contractMutation.isPending} onClick={() => submitContract("new_version")}><Save aria-hidden="true" size={17} />ساخت نسخه جدید</button> : <>
            <button className="button button-secondary" type="button" disabled={!canEdit || contractMutation.isPending} onClick={() => submitContract("save")}><Save aria-hidden="true" size={17} />ذخیره پیش‌نویس</button>
            <button className="button button-secondary" type="button" disabled={!canEdit || Boolean(contract?.approvals.crm)} onClick={() => submitContract("approve_crm")}><CheckCircle2 aria-hidden="true" size={17} />تأیید CRM</button>
            <button className="button button-secondary" type="button" disabled={!canEdit || Boolean(contract?.approvals.data)} onClick={() => submitContract("approve_data")}><ShieldCheck aria-hidden="true" size={17} />تأیید داده</button>
            <button className="button button-secondary" type="button" disabled={!canEdit || Boolean(contract?.approvals.finance)} onClick={() => submitContract("approve_finance")}><CheckCircle2 aria-hidden="true" size={17} />تأیید Finance</button>
            <button className="button button-primary" type="button" disabled={!canEdit || Boolean(contract?.readiness?.missingFa?.length) || contractMutation.isPending} onClick={() => submitContract("lock")}><LockKeyhole aria-hidden="true" size={17} />قفل قرارداد</button>
          </>}
        </div>
      </section>
    </div>
  );
}
