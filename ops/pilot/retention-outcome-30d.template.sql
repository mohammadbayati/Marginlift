-- MarginLift P2 canonical 30-day outcome extract (PostgreSQL template)
-- Replace source table/column names only after Data + Finance approve the mapping.
-- Never export phone, email, national ID, card number, IP, device ID, or raw customer ID.

WITH assignment AS (
  SELECT
    customer_id_hash,
    assigned_policy,
    assigned_at AT TIME ZONE 'UTC' AS assigned_at,
    outcome_closes_at AT TIME ZONE 'UTC' AS outcome_closes_at
  FROM marginlift_assignment_registry
  WHERE experiment_id = :experiment_id
),
purchase_outcome AS (
  SELECT
    a.customer_id_hash,
    COUNT(t.transaction_id) FILTER (WHERE t.status = 'completed') > 0 AS repurchased,
    COALESCE(SUM(t.net_revenue) FILTER (WHERE t.status = 'completed'), 0) AS net_revenue,
    COALESCE(SUM(t.contribution_margin) FILTER (WHERE t.status = 'completed'), 0) AS contribution_margin,
    COALESCE(SUM(t.refund_amount), 0) AS refund_amount
  FROM assignment a
  LEFT JOIN finance_approved_transactions t
    ON t.customer_id_hash = a.customer_id_hash
   AND t.occurred_at >= a.assigned_at
   AND t.occurred_at <= a.outcome_closes_at
  GROUP BY a.customer_id_hash
),
action_outcome AS (
  SELECT
    a.customer_id_hash,
    MIN(e.delivered_at) AS delivered_at,
    MIN(e.exposed_at) AS exposed_at,
    CASE
      WHEN COALESCE(SUM(e.actual_incentive_cost), 0) > 0 THEN 'targeted_discount'
      WHEN COUNT(e.action_id) > 0 THEN 'message_no_discount'
      ELSE 'no_action'
    END AS actual_action,
    COALESCE(SUM(e.actual_incentive_cost), 0) AS incentive_cost,
    COALESCE(SUM(e.actual_channel_cost), 0) AS channel_cost,
    COALESCE(BOOL_OR(e.opt_out), FALSE) AS opt_out,
    COALESCE(BOOL_OR(e.complaint), FALSE) AS complaint,
    COALESCE(BOOL_OR(e.is_cross_policy_contamination), FALSE) AS contaminated
  FROM assignment a
  LEFT JOIN crm_execution_events e
    ON e.customer_id_hash = a.customer_id_hash
   AND e.event_at >= a.assigned_at
   AND e.event_at <= a.outcome_closes_at
  GROUP BY a.customer_id_hash
)
SELECT
  a.customer_id_hash,
  a.assigned_policy,
  x.actual_action,
  a.assigned_at,
  x.delivered_at,
  x.exposed_at,
  a.outcome_closes_at AS outcome_at,
  p.repurchased,
  p.net_revenue,
  p.contribution_margin,
  x.incentive_cost,
  x.channel_cost,
  p.refund_amount,
  x.opt_out,
  x.complaint,
  x.contaminated
FROM assignment a
JOIN purchase_outcome p USING (customer_id_hash)
JOIN action_outcome x USING (customer_id_hash)
ORDER BY a.customer_id_hash;
