// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { db, getTodayStats } from '../../db/database';
import { formatCurrency } from '../../utils/helpers';
import { globalStore } from '../../store/Store';
import { BRAND } from '../../content/brand';

export function useGlobalStore() {
  const [state, setState] = useState(globalStore.getState());
  useEffect(() => {
    return globalStore.subscribe((newState) => {
      setState(newState);
    });
  }, []);
  return state;
}

interface TodayStats {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  paymentBreakdown: Record<string, { count: number; total: number }>;
}

interface TrendDay {
  label: string;
  revenue: number;
  date: Date;
}

export function Dashboard() {
  const storeState = useGlobalStore();
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [weeklyTrend, setWeeklyTrend] = useState<TrendDay[]>([]);
  const [topItems, setTopItems] = useState<{ name: string; qty: number; isVeg?: number }[]>([]);
  const [systemHealth, setSystemHealth] = useState<{
    staffCount: number;
    totalMenuItems: number;
    totalOrders: number;
  }>({ staffCount: 0, totalMenuItems: 0, totalOrders: 0 });
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch today's summary stats
      const todayStats = await getTodayStats();
      setStats(todayStats);

      // Fetch 7-day revenue trend
      const days: TrendDay[] = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();

        let revenue = 0;
        try {
          const orders = await db.orders.where('createdAt').between(dayStart, dayEnd).toArray();
          revenue = orders
            .filter((o: any) => o.paymentStatus === 'paid')
            .reduce((s: number, o: any) => s + (o.total || 0), 0);
        } catch (err) {
          console.error('[Dashboard] Error querying trend orders:', err);
        }
        days.push({
          label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
          revenue,
          date: d,
        });
      }
      setWeeklyTrend(days);

      // Fetch top selling items and look up veg/non-veg status
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const todayOrders = await db.orders.where('createdAt').between(todayStart, todayEnd).toArray();

      const itemCounts: Record<string, number> = {};
      for (const order of todayOrders) {
        let items = order.items;
        if (typeof items === 'string') {
          try {
            items = JSON.parse(items);
          } catch {
            items = [];
          }
        }
        if (Array.isArray(items)) {
          for (const item of items) {
            const name = item.name || 'Unknown';
            itemCounts[name] = (itemCounts[name] || 0) + (item.qty || 1);
          }
        }
      }
      
      const sortedItems = Object.entries(itemCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const itemsWithVeg = [];
      for (const [name, qty] of sortedItems) {
        const menuItem = await db.menuItems.where('name').equals(name).first();
        itemsWithVeg.push({
          name,
          qty,
          isVeg: menuItem ? menuItem.isVeg : 1
        });
      }
      setTopItems(itemsWithVeg);

      // Fetch general system database health counts
      const staffCount = await db.staff.filter((s: any) => s.isActive === true || s.isActive === 1).count();
      const totalMenuItems = await db.menuItems.count();
      const totalOrders = await db.orders.count();
      setSystemHealth({ staffCount, totalMenuItems, totalOrders });

    } catch (err) {
      console.error('[Dashboard] Failed loading dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [storeState.activeTerminalStaff]);

  const maxRevenue = useMemo(() => {
    const maxVal = Math.max(...weeklyTrend.map((d) => d.revenue), 0);
    return maxVal > 0 ? maxVal : 1;
  }, [weeklyTrend]);

  // Construct chart elements
  const chartPoints = useMemo(() => {
    const width = 800;
    const height = 180;
    const paddingX = 40;
    const paddingY = 20;

    let pointsStr = '';
    let fillPointsStr = `${paddingX},${height - paddingY} `;

    weeklyTrend.forEach((t, i) => {
      const x = paddingX + (i / (weeklyTrend.length - 1 || 1)) * (width - 2 * paddingX);
      const y = height - paddingY - (t.revenue / maxRevenue) * (height - 2 * paddingY);
      pointsStr += `${x},${y} `;
      fillPointsStr += `${x},${y} `;
    });
    if (weeklyTrend.length > 0) {
      fillPointsStr += `${width - paddingX},${height - paddingY}`;
    }

    return { pointsStr, fillPointsStr, width, height, paddingX, paddingY };
  }, [weeklyTrend, maxRevenue]);

  if (loading || !stats) {
    return (
      <div className="dash">
        <div className="skeleton" style={{ height: '52px', width: '260px', borderRadius: 'var(--radius-sm)' }} />
        <div className="dash-kpis">
          <div className="skeleton" style={{ height: '148px', borderRadius: 'var(--radius-lg)' }} />
          <div className="skeleton" style={{ height: '148px', borderRadius: 'var(--radius-lg)' }} />
          <div className="skeleton" style={{ height: '148px', borderRadius: 'var(--radius-lg)' }} />
        </div>
        <div className="skeleton" style={{ height: '320px', borderRadius: 'var(--radius-lg)' }} />
        <span className="sr-only" role="status">Loading today&rsquo;s numbers</span>
      </div>
    );
  }

  const activeStaff = storeState.activeTerminalStaff;
  const currentTheme = localStorage.getItem('app_theme') || 'system';
  const themeLabel = { dark: 'Dark', light: 'Light', system: 'System' }[currentTheme] || 'System';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = activeStaff?.name ? String(activeStaff.name).split(' ')[0] : null;

  // The trend line's own scale, so "quiet day" and "busy day" read differently
  // instead of every week flattening to the same shape.
  const weekTotal = weeklyTrend.reduce((s, d) => s + d.revenue, 0);
  const yesterday = weeklyTrend.length > 1 ? weeklyTrend[weeklyTrend.length - 2].revenue : 0;
  const deltaPct = yesterday > 0 ? Math.round(((stats.totalRevenue - yesterday) / yesterday) * 100) : null;

  const KPIS = [
    {
      key: 'revenue',
      label: 'Money in today',
      value: formatCurrency(stats.totalRevenue),
      icon: 'payments',
      hint:
        deltaPct === null
          ? 'No sales yesterday to compare'
          : `${deltaPct >= 0 ? '+' : ''}${deltaPct}% vs yesterday`,
    },
    {
      key: 'orders',
      label: 'Orders served',
      value: String(stats.totalOrders),
      icon: 'receipt_long',
      hint: stats.totalOrders === 0 ? 'First one is coming' : `${weeklyTrend.length}-day streak running`,
    },
    {
      key: 'avgval',
      label: 'Average cup value',
      value: formatCurrency(stats.avgOrderValue),
      icon: 'monitoring',
      hint: 'Per paid order',
    },
  ];

  return (
    <div className="dash">
      <style>{`
        /* ── Operator dashboard ───────────────────────────────────────────
           Juice Pop applied to the admin landing surface: flat opaque cards,
           one chunky accent block per card, display-face numerals. The old
           version leaned on backdrop-filter glass and 10px labels, which read
           as muddy on the light theme and were unreadable on a counter
           terminal at arm's length. */
        .dash {
          padding: var(--space-8) var(--space-6) var(--space-12);
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
          max-width: 1180px;
          margin: 0 auto;
          width: 100%;
        }
        .dash-head {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--space-4);
        }
        .dash-greeting {
          font-family: var(--font-display);
          font-size: var(--text-3xl);
          font-weight: 700;
          line-height: 1.1;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          margin: 0;
        }
        .dash-greeting em {
          font-style: normal;
          color: var(--color-primary-on-surface);
        }
        .dash-sub {
          margin: var(--space-2) 0 0;
          font-size: var(--text-base);
          color: var(--text-secondary);
        }
        .dash-live {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          padding: 8px 16px;
          border-radius: var(--radius-full);
          background: var(--bg-surface);
          border: 1.5px solid var(--border-color);
          font-size: var(--text-sm);
          font-weight: var(--font-semibold);
          color: var(--text-primary);
        }

        .dash-kpis {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: var(--space-4);
        }
        .dash-kpi {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          padding: var(--space-6);
          padding-top: var(--space-8);
          border-radius: var(--radius-lg);
          background: var(--bg-surface);
          border: 1.5px solid var(--border-color);
          box-shadow: var(--shadow-sm);
          overflow: hidden;
        }
        /* The accent is a solid bar, not a 1px rule and not a translucent
           wash — it survives both themes at full strength. */
        .dash-kpi::before {
          content: '';
          position: absolute;
          inset: 0 0 auto;
          height: 8px;
          background: var(--dash-accent);
        }
        .dash-kpi.revenue { --dash-accent: var(--color-success); --dash-ink: var(--color-success-on-surface); }
        .dash-kpi.orders { --dash-accent: var(--color-primary); --dash-ink: var(--color-primary-on-surface); }
        .dash-kpi.avgval { --dash-accent: var(--color-info); --dash-ink: var(--color-info-on-surface); }

        .dash-kpi-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
        }
        .dash-kpi-label {
          font-size: var(--text-sm);
          font-weight: var(--font-semibold);
          color: var(--text-secondary);
        }
        .dash-kpi-icon {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-full);
          display: grid;
          place-items: center;
          background: var(--bg-secondary);
          color: var(--dash-ink);
          flex-shrink: 0;
        }
        .dash-kpi-icon .material-symbols-rounded { font-size: 20px; }
        .dash-kpi-value {
          font-family: var(--font-display);
          font-size: clamp(2rem, 4vw, 2.5rem);
          font-weight: 700;
          line-height: 1;
          letter-spacing: -0.03em;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
        .dash-kpi-hint {
          font-size: var(--text-xs);
          font-weight: var(--font-semibold);
          color: var(--text-muted);
        }

        .dash-card {
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
          padding: var(--space-6);
          border-radius: var(--radius-lg);
          background: var(--bg-surface);
          border: 1.5px solid var(--border-color);
          box-shadow: var(--shadow-sm);
        }
        .dash-card-title {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin: 0;
          font-family: var(--font-display);
          font-size: var(--text-xl);
          font-weight: 600;
          letter-spacing: -0.01em;
          color: var(--text-primary);
        }
        .dash-card-title .material-symbols-rounded { font-size: 22px; color: var(--text-secondary); }
        .dash-card-note {
          font-size: var(--text-sm);
          font-weight: var(--font-semibold);
          color: var(--text-muted);
          margin-left: auto;
          font-variant-numeric: tabular-nums;
        }

        .dash-cols {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
          gap: var(--space-4);
        }

        .dash-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .dash-rank {
          width: 32px;
          text-align: center;
          flex-shrink: 0;
          font-family: var(--font-display);
          font-size: var(--text-md);
          font-weight: 600;
          color: var(--text-muted);
        }
        .dash-row-name {
          font-size: var(--text-base);
          font-weight: var(--font-semibold);
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dash-row-qty {
          font-size: var(--text-base);
          font-weight: var(--font-extrabold);
          color: var(--color-primary-on-surface);
          flex-shrink: 0;
          margin-left: var(--space-3);
          font-variant-numeric: tabular-nums;
        }

        .dash-diag {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) 0;
          border-bottom: 1px solid var(--border-subtle);
        }
        .dash-diag:last-child { border-bottom: 0; padding-bottom: 0; }
        .dash-diag-label {
          font-size: var(--text-base);
          color: var(--text-secondary);
          flex: 1;
          min-width: 0;
        }
        .dash-diag-value {
          font-size: var(--text-base);
          font-weight: var(--font-bold);
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: var(--space-2);
          text-align: right;
        }

        .dash-empty {
          font-size: var(--text-base);
          color: var(--text-muted);
          padding: var(--space-4) 0;
        }

        .dash-days {
          display: flex;
          justify-content: space-between;
          margin-top: var(--space-3);
          padding: 0 40px;
        }
        .dash-day {
          font-size: var(--text-sm);
          font-weight: var(--font-semibold);
          color: var(--text-secondary);
        }
        .dash-day.is-today {
          color: var(--color-primary-on-surface);
          font-weight: var(--font-extrabold);
        }

        .dash-pulse {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--color-success);
          display: inline-block;
          animation: dash-pulse 2s infinite ease-in-out;
        }
        @keyframes dash-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.35); opacity: 0.6; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dash-pulse { animation: none; }
        }

        @media (max-width: 640px) {
          .dash { padding: var(--space-5) var(--space-4) var(--space-10); }
          .dash-greeting { font-size: var(--text-2xl); }
          .dash-days { padding: 0 20px; }
        }
      `}</style>

      <header className="dash-head">
        <div>
          <h1 className="dash-greeting">
            {greeting}{firstName ? ', ' : ''}
            {firstName && <em>{firstName}</em>}
          </h1>
          <p className="dash-sub">Here&rsquo;s how {BRAND.name} is doing today.</p>
        </div>
        <span className="dash-live">
          {storeState.isOnline ? <span className="dash-pulse" aria-hidden="true" /> : null}
          {storeState.isOnline ? 'Synced with cloud' : 'Working offline'}
        </span>
      </header>

      <div className="dash-kpis">
        {KPIS.map((kpi) => (
          <div key={kpi.key} className={`dash-kpi ${kpi.key}`}>
            <div className="dash-kpi-top">
              <span className="dash-kpi-label">{kpi.label}</span>
              <span className="dash-kpi-icon" aria-hidden="true">
                <span aria-hidden="true" className="material-symbols-rounded">{kpi.icon}</span>
              </span>
            </div>
            <div className="dash-kpi-value">{kpi.value}</div>
            <div className="dash-kpi-hint">{kpi.hint}</div>
          </div>
        ))}
      </div>

      {/* 7-Day Revenue Trend */}
      <section className="dash-card" aria-labelledby="dash-trend-title">
        <h2 className="dash-card-title" id="dash-trend-title">
          <span className="material-symbols-rounded" aria-hidden="true">trending_up</span>
          Last 7 days
          <span className="dash-card-note">{formatCurrency(weekTotal)} total</span>
        </h2>

        <div style={{ width: '100%', position: 'relative' }}>
          {/* The chart is decoration over the table below it: sighted users get
              the shape, everyone gets the numbers. */}
          <svg
            viewBox={`0 0 ${chartPoints.width} ${chartPoints.height}`}
            style={{ width: '100%', height: '180px', display: 'block', overflow: 'visible' }}
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <linearGradient id="areaGradDashboard" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="lineGradDashboard" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-primary)" />
                <stop offset="100%" stopColor="var(--color-secondary)" />
              </linearGradient>
            </defs>

            <line x1={chartPoints.paddingX} y1={chartPoints.paddingY} x2={chartPoints.width - chartPoints.paddingX} y2={chartPoints.paddingY} stroke="var(--border-subtle)" strokeWidth="1" />
            <line x1={chartPoints.paddingX} y1={(chartPoints.height - 2 * chartPoints.paddingY) / 2 + chartPoints.paddingY} x2={chartPoints.width - chartPoints.paddingX} y2={(chartPoints.height - 2 * chartPoints.paddingY) / 2 + chartPoints.paddingY} stroke="var(--border-subtle)" strokeWidth="1" />
            <line x1={chartPoints.paddingX} y1={chartPoints.height - chartPoints.paddingY} x2={chartPoints.width - chartPoints.paddingX} y2={chartPoints.height - chartPoints.paddingY} stroke="var(--border-color)" strokeWidth="2" />

            <polygon points={chartPoints.fillPointsStr} fill="url(#areaGradDashboard)" />
            <polyline
              points={chartPoints.pointsStr}
              fill="none"
              stroke="url(#lineGradDashboard)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {weeklyTrend.map((d, i) => {
              const x = chartPoints.paddingX + (i / (weeklyTrend.length - 1 || 1)) * (chartPoints.width - 2 * chartPoints.paddingX);
              const y = chartPoints.height - chartPoints.paddingY - (d.revenue / maxRevenue) * (chartPoints.height - 2 * chartPoints.paddingY);
              const isToday = i === weeklyTrend.length - 1;
              const isHovered = hoveredBarIndex === i;

              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={isHovered ? 7 : isToday ? 5.5 : 4}
                  fill="var(--bg-surface)"
                  stroke={isToday || isHovered ? 'var(--color-primary)' : 'var(--border-color)'}
                  strokeWidth={isHovered ? 4 : 2.5}
                  style={{ transition: 'r 0.15s ease', cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredBarIndex(i)}
                  onMouseLeave={() => setHoveredBarIndex(null)}
                />
              );
            })}
          </svg>

          {hoveredBarIndex !== null && weeklyTrend[hoveredBarIndex] && (
            <div
              style={{
                position: 'absolute',
                left: `${(hoveredBarIndex / (weeklyTrend.length - 1 || 1)) * 90 + 5}%`,
                bottom: `${Math.max((weeklyTrend[hoveredBarIndex].revenue / maxRevenue) * 60 + 30, 40)}px`,
                background: 'var(--bg-secondary)',
                border: '1.5px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 14px',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-bold)',
                color: 'var(--text-primary)',
                boxShadow: 'var(--shadow-md)',
                pointerEvents: 'none',
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                zIndex: 10,
              }}
            >
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: '2px' }}>
                {weeklyTrend[hoveredBarIndex].label}
              </div>
              {formatCurrency(weeklyTrend[hoveredBarIndex].revenue)}
            </div>
          )}
        </div>

        <div className="dash-days">
          {weeklyTrend.map((d, i) => (
            <span key={i} className={`dash-day${i === weeklyTrend.length - 1 ? ' is-today' : ''}`}>
              {d.label}
            </span>
          ))}
        </div>

        <table className="sr-only">
          <caption>Revenue by day, last 7 days</caption>
          <tbody>
            {weeklyTrend.map((d, i) => (
              <tr key={i}>
                <th scope="row">{d.date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</th>
                <td>{formatCurrency(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="dash-cols">
        {/* Top Selling Items */}
        <section className="dash-card" aria-labelledby="dash-top-title">
          <h2 className="dash-card-title" id="dash-top-title">
            <span className="material-symbols-rounded" aria-hidden="true">local_fire_department</span>
            Selling fastest
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {topItems.length === 0 ? (
              <p className="dash-empty">Nothing poured yet today.</p>
            ) : (
              topItems.map((item, i) => {
                const maxQty = topItems[0].qty || 1;
                const widthPercent = Math.round((item.qty / maxQty) * 100);
                return (
                  <div className="dash-row" key={i}>
                    <span className="dash-rank" aria-hidden="true">{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                        <span className="dash-row-name">{item.name}</span>
                        <span className="dash-row-qty">&times;{item.qty}</span>
                      </div>
                      <div
                        className="meter"
                        role="progressbar"
                        aria-label={`${item.name} share of today's top seller`}
                        aria-valuenow={widthPercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div className="meter-fill" style={{ width: `${widthPercent}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* System Health */}
        <section className="dash-card" aria-labelledby="dash-diag-title">
          <h2 className="dash-card-title" id="dash-diag-title">
            <span className="material-symbols-rounded" aria-hidden="true">monitor_heart</span>
            Shop status
          </h2>
          <div>
            {[
              {
                label: 'Cloud connection',
                value: storeState.isOnline ? 'Online' : 'Offline',
                pulse: storeState.isOnline,
              },
              { label: 'Signed in at this till', value: activeStaff ? `${activeStaff.name} · ${activeStaff.role}` : 'Nobody' },
              { label: 'Active staff', value: `${systemHealth.staffCount}` },
              { label: 'Items on the menu', value: `${systemHealth.totalMenuItems}` },
              { label: 'Orders on record', value: `${systemHealth.totalOrders}` },
              { label: 'Screen theme', value: themeLabel },
            ].map((row, idx) => (
              <div className="dash-diag" key={idx}>
                <span className="dash-diag-label">{row.label}</span>
                <span className="dash-diag-value">
                  {row.pulse && <span className="dash-pulse" aria-hidden="true" />}
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Payment Split Breakdown */}
      <section className="dash-card" aria-labelledby="dash-split-title">
        <h2 className="dash-card-title" id="dash-split-title">
          <span className="material-symbols-rounded" aria-hidden="true">monitoring</span>
          How people paid
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {Object.keys(stats.paymentBreakdown).length === 0 ? (
            <p className="dash-empty">No sales recorded yet today.</p>
          ) : (
            Object.entries(stats.paymentBreakdown).map(([method, data]) => {
              const label = method === 'upi' ? 'UPI' : method === 'cash' ? 'Cash' : method.toUpperCase();
              const pct = stats.totalRevenue > 0 ? Math.round((data.total / stats.totalRevenue) * 100) : 0;
              return (
                <div key={method} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                    <span className="dash-row-name">
                      {label}{' '}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--font-medium)' }}>
                        · {data.count} {data.count === 1 ? 'order' : 'orders'}
                      </span>
                    </span>
                    <span className="dash-row-qty">{formatCurrency(data.total)}</span>
                  </div>
                  <div
                    className="meter"
                    role="progressbar"
                    aria-label={`${label} share of today's revenue`}
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="meter-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
