# Expected values: the equation

Replaces the old goals and "Expect" buttons (beta 1.18). The expectation for a day is no longer typed in; it is computed from your own ratings by `src/forecast.js` (pure functions, no storage, no network). `src/forecast-ui.js` only draws it.

Ratings are the raw 1-10 values, never the relative 0-15 score. "Mood" is the happiness metric. Only days **before** the target are used, so the card for a past day shows what was expected at the time.

## The equation

For each rating k (mood, productivity, connection), with z = (rating - mu_k) / sigma_k:

    EV_k(T) = clip( mu_k + sigma_k * ( delta_k[dow(T)] + yhat_k + rho_k ),  1, 10 )

| Term | Meaning | How it is calculated |
|---|---|---|
| mu_k, sigma_k | Baseline level and spread | Recency-weighted mean and sd, half-life 60 days; sd floored at 0.6 so a flat record cannot divide by zero |
| delta_k[dow] | Weekday effect (item 2) | Sum of z on that weekday / (days + 4): shrunk toward 0 so one odd Monday means little |
| yhat_k | Dynamics (items 1, 4, 5, 6, 7, 10) | Ridge regression on the deseasonalised state (z minus delta), fitted on your own history |
| rho_k | Similar days and week trajectory (items 3, 8) | Kernel average of the regression's leave-one-out errors on the nearest past days, shrunk by 6 pseudo-neighbours |

### yhat features (14 per rating, all in z units)

| Feature | Item | Definition |
|---|---|---|
| a3, a7 - a3, a30 - a7 | 4 | 3, 7, 30-day averages as non-overlapping contrasts (current vs baseline, week vs last 3 days, month vs week) |
| slope | 5 | (today - two days ago) / 2. 5,6,7 gives +, 9,8,7 gives - at the same level |
| excess+, excess- | 6, 10 | Amount beyond 1 sd above / below baseline, separate weights, so decline after great days and recovery after bad days are learned separately |
| streak level | 1 | sign * (P(next day on the same side of baseline given this run length) - base rate), smoothed |
| streak direction | 1 | same, for runs of consecutive rises or falls |
| weekday after state | 2 | Mean z for this weekday after a day above / below baseline ("Mondays after a strong Sunday") |
| weekday in week state | 2 | Mean z for this weekday when the 7-day average is above / below baseline ("Fridays in strong weeks") |
| other ratings, lag 1 and 2 | 7 | The other two ratings, yesterday and the day before |

### rho: similar days and trajectory (items 3, 8)
Each past day is described by its 3-day level, slope, streak and week-so-far average for all three ratings. The distance to today adds the squared gap between the week-so-far paths (Monday, Tuesday, ... compared position by position, so a week that started 8.2, 8.5, 8.1 finds weeks that started alike) and a penalty if the weekday differs (0.5 same type of day, 1.5 weekend vs weekday). The nearest sqrt(rows) days (5 to 12) vote with Gaussian weights.

## Rules-based version (fixed weights)
A second, deliberately plain version sits beside the learned one, so each forecast can be explained in one sentence. Six readable estimates, each in rating points, combined with fixed weights:

| Part | Weight | Estimate |
|---|---|---|
| Similar days | 40% | Rating the day after the most similar past days (kernel-weighted) |
| Week so far | 20% | Rating on this weekday in past weeks whose Monday-onward path looked most like this one |
| Streak | 15% | P(streak continues) x typical rating on that side of your average + (1 - P) x typical rating on the other side |
| Weekday | 10% | Your average plus this weekday's shrunk effect |
| Mean reversion | 10% | Your long-run average |
| Other ratings | 5% | Regression of tomorrow on today's other two ratings |

`EV_rules = sum(w_i * est_i) / sum(w_i)` over the parts that exist. A part that cannot be worked out (no streak today, Monday has no week so far, fewer than 21 days of history) gives its share to the others, and the card says so. The explanation is the three largest parts in words: "Productivity is expected at 8.1 because similar days averaged 8.3, your 6-day run above your average goes on 72% of the time and Tuesdays usually run 0.4 above your average".

These weights are a sensible default, not fitted. They have no persistence term of their own (yesterday only enters through similar days and the streak), and no interval. The big numbers, ranges and confidence use the learned version. Insights > Observe > Forecast accuracy shows both side by side on your own days.

## Avoiding double counting (item 6 of the brief)
1. Weekday effects are removed **before** the dynamics are measured, so a Monday dip is not read as momentum.
2. Moving averages enter as contrasts, not three overlapping averages.
3. Ridge regression splits credit between correlated features. The penalty is picked by leave-one-out error, and "no signal" (intercept only) competes, so noise cannot win.
4. Analog neighbours predict the regression's leave-one-out **errors**, not the rating, so they only add what the regression missed.
5. Streak tables and weekday-after-state means are built in time order, so a day's feature only uses what was known then.

## Weights
They are learned per person (ridge), not fixed. The only constants chosen by hand are in `CFG` at the top of `forecast.js`: half-lives, shrinkage pseudo-counts, 0.4 weight on the 7-day average when there are fewer than 21 consecutive-day pairs to fit, the minimum of 7 rated days. They are starting points, not tuned optima.

## Spread and confidence (items 9, 10)
- Standard deviation: `sd = sigma_k * sqrt( LOO_MSE * (1 + leverage) )`, widened toward the unconditional spread when the day before is not rated (gaps count as unknown, not as zero). The range shown is EV +/- 1.28 sd (about 80%), clipped to 1-10.
- Confidence: `100 * n/(n+20) * (1 - sd/3)`, where n is the number of fitted pairs and sd is in rating points. High 55+, Medium 30-54, Low under 30. This is a rating of data sufficiency and predictability, not a probability; the range is the calibrated part.
- Under 30 days is labelled preliminary.
- Recovery: `patterns()` reports how often a low day (z <= -1) is followed by a day back within half an sd of baseline, how often a high day cools off, and average slump / run length. The forecast learns the same effects through excess+/-, streaks and the analog stage; the numbers are shown in Insights > Observe.

## Accuracy
Insights > Observe > Forecast accuracy replays each recent day using only the days before it, and compares the error with guessing your overall average. On synthetic data with real structure the learned equation cut error by about 29% against guessing your average and the fixed-weight rules by about 17%; on pure noise all three tie (within 1%). On your data it can be worse than the average over a short window; the card says so.

## Machine-learning alternatives (with enough data)
Roughly 1 to 2 years of daily data. Candidates in order of effort: (1) gradient-boosted trees (LightGBM) on the same 14 features plus day-of-year, with time-series cross-validation; (2) a vector autoregression (VAR) or a state-space model (Kalman filter with a weekly seasonal) for the three ratings jointly; (3) quantile regression or conformal prediction for ranges that are calibrated by construction; (4) a small sequence model (GRU) only if you pool many users, since one person's history is too short. Keep the ridge model as the baseline to beat.

## Limits
One person's history is short and noisy. Ratings are whole numbers, so the range is wider than it needs to be for a continuous quantity. Nothing outside the ratings (sleep, events, weather) is known. Treat the numbers as a calibrated guess, not a promise.
