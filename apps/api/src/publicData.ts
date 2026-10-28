export const publicTransparency = {
  synthetic: true,
  disclaimer: "Data simulasi untuk demonstrasi prototipe. Bukan data anggaran resmi.",
  summary: {
    reviewedItems: 18,
    followUps: { resolved: 9, inProgress: 6, awaitingRevision: 3 },
    resolutionRate: 50
  },
  trends: [
    { period: "Jan 2026", reviewed: 3, resolved: 1 },
    { period: "Feb 2026", reviewed: 5, resolved: 2 },
    { period: "Mar 2026", reviewed: 4, resolved: 2 },
    { period: "Apr 2026", reviewed: 6, resolved: 4 }
  ]
} as const;
