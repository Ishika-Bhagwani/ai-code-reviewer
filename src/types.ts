export interface ReviewIssue {
  line: number;
  category: 'Logic' | 'Performance' | 'Security' | 'Style';
  severity: 'High' | 'Medium' | 'Low';
  label: string;
  explanation: string;
  suggestion: string;
  originalCode: string; // The specific snippet being flagged
}

export interface ReviewReport {
  summary: string;
  score: number; // 0 to 100
  totalIssues: number;
  timeComplexity: string;
  spaceComplexity: string;
  complexitySuggestions: string;
  issues: ReviewIssue[];
}
