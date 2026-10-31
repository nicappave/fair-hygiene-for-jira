import React, { useEffect, useState, useCallback } from 'react';
import ForgeReconciler, {
  Badge, Box, Button, ButtonGroup, DatePicker, DynamicTable, EmptyState, Heading,
  HorizontalStackBarChart, Inline, Label, Link, LoadingButton, Lozenge, ProgressBar,
  SectionMessage, Select, Spinner, Stack, Tab, TabList, TabPanel, Tabs, Text, Textfield,
  Toggle, Tooltip, xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const GATE = {
  pass: ['success', 'Pass'],
  at_risk: ['moved', 'At risk'],
  fail: ['removed', 'Below gate'],
  insufficient_sample: ['default', 'Too few issues'],
};
const REASON = {
  no_time_logged: 'No time logged',
  backdated_worklog: 'Time logged on a later day',
  no_proof: 'No proof of work',
  copied_comment_only: 'Only a copied comment',
};
const DECISION = {
  defer: ['success', 'Nothing to do'],
  excuse: ['inprogress', 'Not theirs'],
  score: ['removed', 'Fail stands'],
  legitimate: ['success', 'Explained'],
  not_legitimate: ['removed', 'Not explained'],
};
// Atlassian design-system chart colours (success.bold, danger.bold, neutral) as hex: the
// chart takes raw colours, and its default palette drew fails in green.
// In the order the outcomes appear in the data: Passed, Failed, Awaiting verdict.
const CHART_COLORS = ['#22A06B', '#C9372C', '#8590A2'];
const KIND = { deferral: 'Closing note', late: 'Late close', open: 'Overdue / stale' };
const panel = xcss({ paddingBlock: 'space.200' });
const card = xcss({ padding: 'space.200', borderRadius: 'border.radius', backgroundColor: 'elevation.surface.sunken' });

function Stat({ label, value, hint }) {
  return (
    <Box xcss={card}>
      <Stack space="space.050">
        <Text size="small">{label}</Text>
        <Heading size="large">{value}</Heading>
        {hint ? <Text size="small">{hint}</Text> : null}
      </Stack>
    </Box>
  );
}

function Team({ report }) {
  const head = {
    cells: [
      { key: 'name', content: 'Person', isSortable: true },
      { key: 'n', content: 'Closed', isSortable: true },
      { key: 'p1', content: 'Same-day time', isSortable: true },
      { key: 'p2', content: 'Proof of work', isSortable: true },
      { key: 'all', content: 'Score', isSortable: true },
      { key: 'gate', content: 'Gate' },
      { key: 'ontime', content: 'On time', isSortable: true },
      { key: 'lever', content: 'Biggest lever' },
    ],
  };
  const rows = report.members.map((m) => {
    const s = m.summary;
    const [tone, label] = GATE[s.gate];
    return {
      key: m.id,
      cells: [
        { key: 'name', content: m.name },
        { key: 'n', content: s.tasksCounted },
        { key: 'p1', content: report.config.requireWorklog ? pct(s.p1Rate) : 'off' },
        { key: 'p2', content: pct(s.p2Rate) },
        { key: 'all', content: <Text weight="bold">{pct(s.overallRate)}</Text> },
        { key: 'gate', content: <Lozenge appearance={tone}>{label}</Lozenge> },
        { key: 'ontime', content: pct(s.lateness.onTimeRate) },
        {
          key: 'lever',
          content: s.topFailReason
            ? `${REASON[s.topFailReason.reason] || s.topFailReason.reason} (${s.topFailReason.count})`
            : (s.pendingReview ? `${s.pendingReview} note(s) awaiting a verdict` : '—'),
        },
      ],
    };
  });
  const chart = report.members.flatMap((m) => {
    const live = m.rows.filter((r) => !r.excluded);
    return [
      { person: m.name, outcome: 'Passed', issues: live.filter((r) => r.pass).length },
      { person: m.name, outcome: 'Failed', issues: live.filter((r) => !r.pass).length },
      { person: m.name, outcome: 'Awaiting verdict', issues: m.summary.pendingReview },
    ];
  });
  return (
    <Stack space="space.300">
      <Inline space="space.200" shouldWrap>
        <Stat label="Team score" value={pct(report.team.overallRate)} hint={`${report.team.tasksCounted} closed issues counted`} />
        <Stat label="At or above the gate" value={`${report.team.gatePass} of ${report.team.members}`} hint={`gate ${pct(report.config.gatePass)}`} />
        <Stat label="Notes awaiting a verdict" value={report.team.pendingReview} hint="held out of scores until judged" />
      </Inline>
      {report.members.length ? (
        <HorizontalStackBarChart
          data={chart} xAccessor="person" yAccessor="issues" colorAccessor="outcome" title="Closed issues this week"
          colorPalette={CHART_COLORS}
        />
      ) : null}
      <DynamicTable head={head} rows={rows} emptyView={<Text>Nobody closed an issue in this week.</Text>} />
      {report.members.map((m) => <PersonFails key={m.id} member={m} />)}
    </Stack>
  );
}

function PersonFails({ member }) {
  const fails = member.rows.filter((r) => !r.excluded && !r.pass);
  if (!fails.length) return null;
  return (
    <Stack space="space.100">
      <Heading size="small">{`${member.name}: ${fails.length} issue(s) to fix`}</Heading>
      {fails.map((r) => (
        <Inline key={r.key} space="space.100" alignBlock="center">
          <Link href={`/browse/${r.key}`}>{r.key}</Link>
          <Text>{r.summary}</Text>
          {r.p1 && !r.p1.pass ? <Lozenge appearance="removed">{REASON[r.p1.reason]}</Lozenge> : null}
          {r.p2 && !r.p2.pass ? <Lozenge appearance="removed">{REASON[r.p2.reason]}</Lozenge> : null}
          {r.review && r.review.decision === 'score' ? <Tooltip content={r.review.reason}><Badge>judged</Badge></Tooltip> : null}
        </Inline>
      ))}
    </Stack>
  );
}

function Judgements({ report, onJudge, judging, progress, onOverride }) {
  const items = [];
  for (const m of report.members) {
    for (const r of m.rows) {
      if (r.review) items.push(r.review);
      if (r.lateness && r.lateness.review) items.push(r.lateness.review);
    }
    for (const o of m.open) if (o.review) items.push(o.review);
  }
  const pending = items.filter((i) => i.status === 'pending');
  return (
    <Stack space="space.300">
      <SectionMessage appearance={pending.length ? 'information' : 'success'} title={pending.length ? `${pending.length} note(s) to judge` : 'Every note has a verdict'}>
        <Text>
          Rules decide the clear cases. A note that only might mean "nothing to do", a late close with a reason, or an
          overdue issue with an explanation goes to Claude, which reads the whole issue. Until then it is held out of the
          score, never counted as a fail. A project admin can overrule any verdict.
        </Text>
        {pending.length ? (
          <LoadingButton appearance="primary" isLoading={judging} onClick={onJudge}>Judge with Claude</LoadingButton>
        ) : null}
        {judging ? <ProgressBar value={progress} /> : null}
      </SectionMessage>
      {items.length ? items.map((i) => <Verdict key={i.id} item={i} onOverride={onOverride} />)
        : <EmptyState header="No notes needed a judgement this week" />}
    </Stack>
  );
}

function Verdict({ item, onOverride }) {
  const [tone, label] = item.decision ? DECISION[item.decision] : ['default', 'Awaiting verdict'];
  const options = item.kind === 'deferral' ? ['defer', 'excuse', 'score'] : ['legitimate', 'not_legitimate'];
  return (
    <Box xcss={card}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Lozenge>{KIND[item.kind]}</Lozenge>
          <Link href={`/browse/${item.issueKey}`}>{item.issueKey}</Link>
          <Text weight="medium">{item.summary}</Text>
          <Text size="small">{item.memberName}</Text>
          <Lozenge appearance={tone} isBold>{label}</Lozenge>
          {item.source === 'lead' ? <Badge appearance="primary">set by lead</Badge> : null}
        </Inline>
        {item.note ? <Text><Text as="em">Note:</Text> {item.note}</Text> : null}
        {item.reason ? <Text><Text weight="bold">Why:</Text> {item.reason}</Text> : null}
        <Inline space="space.100" alignBlock="center">
          <Text size="small">Overrule:</Text>
          <ButtonGroup label="Overrule">
            {options.filter((o) => o !== item.decision).map((o) => (
              <Button key={o} appearance="subtle" spacing="compact" onClick={() => onOverride(item, o)}>{DECISION[o][1]}</Button>
            ))}
            {item.source === 'lead' ? (
              <Button appearance="subtle" spacing="compact" onClick={() => onOverride(item, null)}>Restore Claude's verdict</Button>
            ) : null}
          </ButtonGroup>
        </Inline>
      </Stack>
    </Box>
  );
}

function OpenWork({ report }) {
  const head = {
    cells: ['Issue', 'Person', 'Flags', 'Explanation'].map((c) => ({ key: c, content: c })),
  };
  const rows = report.members.flatMap((m) => m.open.map((o) => ({
    key: o.key,
    cells: [
      { key: 'Issue', content: <Inline space="space.100"><Link href={`/browse/${o.key}`}>{o.key}</Link><Text>{o.summary}</Text></Inline> },
      { key: 'Person', content: m.name },
      { key: 'Flags', content: <Inline space="space.050" shouldWrap>{o.flags.map((f) => <Lozenge key={f} appearance={f === 'overdue' || f === 'stale' ? 'moved' : 'default'}>{f.replace(/_/g, ' ')}</Lozenge>)}</Inline> },
      {
        key: 'Explanation',
        content: o.review
          ? (o.review.decision ? <Tooltip content={o.review.reason}><Lozenge appearance={DECISION[o.review.decision][0]}>{DECISION[o.review.decision][1]}</Lozenge></Tooltip> : <Lozenge>Awaiting verdict</Lozenge>)
          : (o.flags.includes('overdue') || o.flags.includes('stale') ? <Lozenge appearance="removed">No note</Lozenge> : '—'),
      },
    ],
  })));
  return (
    <Stack space="space.200">
      <Text>Open issues right now with a missing date or estimate, or overdue or stale. These are shown, not scored.</Text>
      <DynamicTable head={head} rows={rows} rowsPerPage={20} emptyView={<Text>No open-work risks.</Text>} />
    </Stack>
  );
}

function Settings({ initial, onSave }) {
  const [c, setC] = useState(initial);
  const [saving, setSaving] = useState(false);
  const zones = ['UTC', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Asia/Bangkok', 'Asia/Singapore', 'Australia/Sydney'];
  return (
    <Stack space="space.200">
      <Label labelFor="tz">Team time zone (decides "same day" and the week)</Label>
      <Select inputId="tz" value={{ label: c.timeZone, value: c.timeZone }} options={zones.map((z) => ({ label: z, value: z }))} onChange={(o) => setC({ ...c, timeZone: o.value })} />
      <Inline space="space.100" alignBlock="center">
        <Toggle id="wl" isChecked={c.requireWorklog} onChange={() => setC({ ...c, requireWorklog: !c.requireWorklog })} />
        <Label labelFor="wl">Score same-day time logging (turn off if the team does not log time)</Label>
      </Inline>
      <Label labelFor="gate">Gate (%)</Label>
      <Textfield id="gate" type="number" value={String(Math.round(c.gatePass * 100))} onChange={(e) => setC({ ...c, gatePass: Number(e.target.value) / 100 })} />
      <Label labelFor="stale">Stale after (days without the assignee touching an in-progress issue)</Label>
      <Textfield id="stale" type="number" value={String(c.staleDays)} onChange={(e) => setC({ ...c, staleDays: Number(e.target.value) })} />
      <Label labelFor="labels">Labels to leave out (comma separated)</Label>
      <Textfield id="labels" value={c.excludeLabels.join(', ')} onChange={(e) => setC({ ...c, excludeLabels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
      <LoadingButton appearance="primary" isLoading={saving} onClick={async () => { setSaving(true); await onSave(c); setSaving(false); }}>Save settings</LoadingButton>
    </Stack>
  );
}

function App() {
  const [weekStart, setWeekStart] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [judging, setJudging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState(null);
  const [tab, setTab] = useState(0);

  const load = useCallback(async (week) => {
    setLoading(true);
    setError(null);
    try {
      setReport(await invoke('getReport', { weekStart: week, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    } catch (e) {
      setError(e.message || String(e));
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(weekStart); }, [weekStart]);

  const judgeAll = async () => {
    const ids = report.pending.map((p) => p.id);
    setJudging(true);
    setProgress(0);
    const failed = [];
    for (let i = 0; i < ids.length; i += 4) {
      const res = await invoke('judge', { ids: ids.slice(i, i + 4) });
      failed.push(...res.filter((r) => !r.ok));
      setProgress(Math.min(1, (i + 4) / ids.length));
    }
    setJudging(false);
    setNotice(failed.length ? `${failed.length} note(s) could not be judged and stay held out: ${failed[0].error}` : null);
    load(weekStart);
  };

  const override = async (item, decision) => {
    try {
      await invoke('override', { id: item.id, kind: item.kind, decision });
      load(weekStart);
    } catch (e) {
      setNotice(e.message || String(e));
    }
  };

  return (
    <Stack space="space.300">
      <Inline space="space.200" alignBlock="end" spread="space-between">
        <Stack space="space.050">
          <Text>{report ? `Week of ${report.window.weekStart} to ${report.window.weekEnd} (${report.window.timeZone})` : ' '}</Text>
        </Stack>
        <Inline space="space.100" alignBlock="end">
          <Stack space="space.050">
            <Label labelFor="week">Any day in the week</Label>
            <DatePicker id="week" value={weekStart || (report && report.window.weekStart) || undefined} onChange={(d) => setWeekStart(d)} />
          </Stack>
          <Button onClick={() => load(weekStart)}>Refresh</Button>
        </Inline>
      </Inline>
      {notice ? <SectionMessage appearance="warning"><Text>{notice}</Text></SectionMessage> : null}
      {error ? <SectionMessage appearance="error" title="Could not build the report"><Text>{error}</Text></SectionMessage> : null}
      {loading && !report ? <Spinner label="Reading this week's issues" /> : null}
      {report ? (
        <Tabs id="views" selected={tab} onChange={(i) => setTab(i)}>
          <TabList>
            <Tab>Scores</Tab>
            <Tab>{`Judgements${report.pending.length ? ` (${report.pending.length})` : ''}`}</Tab>
            <Tab>Open work</Tab>
            <Tab>Settings</Tab>
          </TabList>
          <TabPanel><Box xcss={panel}><Team report={report} /></Box></TabPanel>
          <TabPanel><Box xcss={panel}><Judgements report={report} onJudge={judgeAll} judging={judging} progress={progress} onOverride={override} /></Box></TabPanel>
          <TabPanel><Box xcss={panel}><OpenWork report={report} /></Box></TabPanel>
          <TabPanel>
            <Box xcss={panel}>
              <Settings initial={report.config} onSave={async (c) => {
                try { await invoke('setConfig', { config: c }); load(weekStart); } catch (e) { setNotice(e.message || String(e)); }
              }} />
            </Box>
          </TabPanel>
        </Tabs>
      ) : null}
    </Stack>
  );
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
