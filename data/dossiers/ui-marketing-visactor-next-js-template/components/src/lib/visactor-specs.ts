export const salesLineSpec = {
  type: "line",
  data: [
    {
      id: "sales",
      values: [
        { date: "Mon", value: 120 },
        { date: "Tue", value: 180 },
        { date: "Wed", value: 140 },
        { date: "Thu", value: 220 },
        { date: "Fri", value: 260 }
      ]
    }
  ],
  xField: "date",
  yField: "value",
  seriesField: "id",
  legends: { visible: false },
  point: { visible: true },
  axes: [
    { orient: "bottom", type: "band" },
    { orient: "left", type: "linear" }
  ],
  crosshair: { xField: { visible: true } }
} as const;
