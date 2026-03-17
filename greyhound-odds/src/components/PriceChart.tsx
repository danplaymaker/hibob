"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { PriceSnapshot } from "@/lib/types";

export function PriceChart({ history }: { history: PriceSnapshot[] }) {
  const data = history.map((s) => ({
    time: new Date(s.timestamp).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    "BF Back": s.betfairBack,
    "BF Lay": s.betfairLay,
    "BF Mid":
      s.betfairBack != null && s.betfairLay != null
        ? +((s.betfairBack + s.betfairLay) / 2).toFixed(2)
        : null,
    Bookmaker: s.bookmakerOdds,
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: "#555570" }}
            tickLine={false}
            axisLine={{ stroke: "#2a2a3a" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#555570" }}
            tickLine={false}
            axisLine={{ stroke: "#2a2a3a" }}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "#12121a",
              border: "1px solid #2a2a3a",
              borderRadius: "6px",
              fontSize: "11px",
            }}
            labelStyle={{ color: "#8888a0" }}
          />
          <Legend
            wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
          />
          <Line
            type="monotone"
            dataKey="BF Back"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="BF Lay"
            stroke="#8b5cf6"
            strokeWidth={1.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="BF Mid"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="Bookmaker"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
