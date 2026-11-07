import React from 'react';
import { createRoot } from 'react-dom/client';
import { parseProgram } from '../src/parse.js';
import { BlockFailure, BlockView } from '../src/client/components.jsx';
import { CSS } from '../src/client/styles.js';

const SAMPLES = [
  {
    caption: '营收季度 · 单序列柱状图是排行榜，不是坐标图',
    title: 'Q4 营收',
    program: [
      'root = Stack([h, note, chart])',
      'h = Row([s1, s2])',
      's1 = Stat("本季营收", "¥412k", "+12.4%")',
      's2 = Stat("订单数", 1284, "+3.1%")',
      'note = Callout("退款与试用订单不计入这两个数字。", "info")',
      'chart = BarChart(["Q1", "Q2", "Q3", "Q4"], [q], "k", true)',
      'q = Series("Revenue", [98, 104, 96, 114])',
    ].join('\n'),
  },
  {
    caption: '服务健康 · 数字右对齐，状态用文字不用色块',
    title: '生产环境',
    program: [
      'root = Stack([s, t, flow])',
      's = Row([a, b, c])',
      'a = Stat("在线服务", 12)',
      'b = Stat("P95 延迟", "184 ms", "-23 ms")',
      'c = Stat("错误率", "0.42%", "+0.18%", "warning")',
      't = Table(["服务", "请求/分", "P95", "近 1 小时"], [["gateway", 48210, "96 ms", "正常"], ["search", 18422, "212 ms", "降级"], ["billing", 6110, "1.4 s", "超时"]])',
      'flow = Steps([{title: "灰度 5%", status: "done"}, {title: "灰度 50%", status: "current"}, {title: "全量", status: "todo"}], "row")',
    ].join('\n'),
  },
  {
    caption: '事故复盘 · 只有 warning / error 才有底色',
    title: '2026-11-07 支付超时',
    program: [
      'root = Stack([warn, text, flow, multi])',
      'warn = Callout("超时窗口 21:04–21:19，影响 3 笔结算。", "warning", "已恢复")',
      'text = Text("根因是连接池上限仍是默认的 **20**，发布时没有跟着 QPS 调整；`maxOpen` 现在降到 8 后再灰度。")',
      'flow = Steps([{title: "定位", markdown: "连接池等待队列", status: "done"}, {title: "止血", markdown: "回滚 v2.31", status: "done"}, {title: "复现", markdown: "压测 900 QPS", status: "blocked"}, {title: "修复", status: "todo"}], "column")',
      'multi = BarChart(["21:00", "21:05", "21:10"], [ok, err], "rps")',
      'ok = Series("成功", [820, 610, 240])',
      'err = Series("超时", [12, 148, 402])',
    ].join('\n'),
  },
  {
    caption: '写错了 · 说明原因并折叠源码，而不是画半块',
    title: '不成立的块',
    program: [
      'root = Stack([a, t])',
      'a = BarChart(["Q1", "Q2"], [s])',
      's = Series("Revenue", [98, 104, 96])',
      't = Chat("hi")',
    ].join('\n'),
  },
];

function Sample({ sample }) {
  const parsed = parseProgram(sample.program);
  return (
    <section className="demo">
      <div className="demo-caption">{sample.caption}</div>
      <div className="demo-surface">
        {parsed.ok
          ? <BlockView tree={parsed.tree} title={sample.title} />
          : <BlockFailure diagnostics={parsed.diagnostics} program={sample.program} />}
      </div>
    </section>
  );
}

function App() {
  return (
    <div className="demo-page">
      <header className="demo-head">
        <div>
          <div className="demo-title">openui blocks · 预览</div>
          <div className="demo-sub">五个只读组件，直接跑插件里的同一个渲染器</div>
        </div>
        <div className="demo-toggle">
          <button type="button" data-mode="light" onClick={() => setMode('light')}>浅色</button>
          <button type="button" data-mode="dark" onClick={() => setMode('dark')}>深色</button>
          <button type="button" data-mode="narrow" onClick={() => setMode('narrow')}>窄屏</button>
        </div>
      </header>
      {SAMPLES.map((sample, i) => <Sample key={i} sample={sample} />)}
    </div>
  );
}

function setMode(mode) {
  const body = document.body;
  body.toggleAttribute('data-ds-dark-theme', mode === 'dark');
  body.toggleAttribute('data-narrow', mode === 'narrow');
  for (const button of document.querySelectorAll('.demo-toggle button')) {
    button.toggleAttribute('data-active', button.dataset.mode === mode);
  }
}

const style = document.createElement('style');
style.textContent = CSS;
document.head.appendChild(style);

createRoot(document.getElementById('root')).render(<App />);
if (window.location.hash === '#dark') setMode('dark');
