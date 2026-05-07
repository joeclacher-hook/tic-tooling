# user_activity skill

Determine the power user activity threshold for a customer and produce the SQL to configure it.

## Invocation

```
/user_activity <customer>
```

`<customer>` is the customer folder name (e.g. `redzone`, `acton`). If not provided, ask.

---

## Steps

### 1. Confirm files exist

Check that both of these files exist for the customer:
- `dug/customers/<customer>/s3iceberg/users.sql`
- `dug/customers/<customer>/s3iceberg/daily_user_product_metrics_activity_count.sql`

If either is missing, tell the user and stop.

### 2. Read the metric SQL

Read `dug/customers/<customer>/s3iceberg/daily_user_product_metrics_activity_count.sql`.

Note the distinct `product_key` values it produces. If there are multiple, run the analysis once per product key (filter by product key in the outer aggregation).

### 3. Rewrite the date filter to a 30-day range

The metric SQL filters to a single day via a `{metric_date}` placeholder — e.g.:

```sql
WHERE ud.report_date = DATE(from_iso8601_timestamp('{metric_date}'))
-- or
WHERE DATE(from_iso8601_timestamp("date")) = DATE(from_iso8601_timestamp('{metric_date}'))
```

Rewrite the equality filter to a 30-day range ending today. Identify the date expression wrapping `{metric_date}` and apply the same expression to both bounds. Examples:

```sql
-- original
WHERE ud.report_date = DATE(from_iso8601_timestamp('{metric_date}'))
-- rewritten
WHERE ud.report_date BETWEEN DATE_ADD('day', -29, CURRENT_DATE) AND CURRENT_DATE

-- original
WHERE DATE(from_iso8601_timestamp("date")) = DATE(from_iso8601_timestamp('{metric_date}'))
-- rewritten
WHERE DATE(from_iso8601_timestamp("date")) BETWEEN DATE_ADD('day', -29, CURRENT_DATE) AND CURRENT_DATE
```

Remove the `{metric_date}` placeholder entirely — the rewritten query is self-contained with no parameters.

If the date filter pattern is ambiguous or you are not confident in the rewrite, stop and show the user the original filter line and ask them to confirm the intended rewrite before proceeding.

### 4. Run the aggregating query

Wrap the rewritten metric SQL in an outer aggregation. Each query returns a single row:

```sql
SELECT
    count(*) AS total_users,
    count(*) FILTER (WHERE CAST(activity_count AS DOUBLE) > 0) AS total_active_users,
    APPROX_PERCENTILE(CAST(activity_count AS DOUBLE), 0.9) AS p90,
    APPROX_PERCENTILE(CAST(activity_count AS DOUBLE), 0.92) AS p92,
    APPROX_PERCENTILE(CAST(activity_count AS DOUBLE), 0.95) AS p95
FROM (
    <rewritten_metric_sql>
)
```

Run via:

```bash
uv run scripts/athena_query.py "<wrapped_sql>" customer_<customer>_s3iceberg --json
```

If there are multiple product keys, add a `WHERE product_key = '<key>'` filter in the outer query and run once per key.

### 5. Compute the threshold

The `p90` value from the query is the 30-day activity sum at the 90th percentile — use it directly as the threshold:

```
power_user_threshold = ceil(p90)
```

No scaling needed since the inner query already covers the full 30-day window.

### 6. Output

Print a summary:

```
Customer:                        <customer>
Product key:                     <product_key>
Window:                          30 days (CURRENT_DATE - 29 → CURRENT_DATE)
Total users with any activity:   <total_active_users> / <total_users>
30-day p90 activity:             <p90>
30-day p92 activity:             <p92>
30-day p95 activity:             <p95>
Power user threshold (p90):      <power_user_threshold>
```

Then the SQL UPDATE template (user must fill in `id` and `product_id`):

```sql
UPDATE stage2.customer_product_processing_configuration_settings
SET active_user_historic_days        = 30,
    power_user_historic_days         = 30,
    power_user_historic_activity_sum = <power_user_threshold>
WHERE id = <TODO: fill in id>
  AND customer_id = '<customer>'
  AND product_id = <TODO: fill in product_id>;
```

If there are multiple product keys, output one block per product key.

---

## Notes

- The database name is always `customer_<customer>_s3iceberg`.
- The rewritten query is self-contained — no `{metric_date}` substitution needed at runtime.
- Do not use `--limit 0` — the wrapped query returns 1 row so the default limit is fine.
- Do not modify the customer's SQL files on disk — the rewrite is only for this query.
