import * as vscode from 'vscode';
import { GoogleGenAI } from "@google/genai";

export function activate(context: vscode.ExtensionContext) {
    const provider = new AIReviewViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(AIReviewViewProvider.viewType, provider)
    );

    let disposable = vscode.commands.registerCommand('ai-code-reviewer.analyze', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found!');
            return;
        }

        // Focus the view
        await vscode.commands.executeCommand('ai-code-reviewer.view.focus');

        const code = editor.document.getText();
        const language = editor.document.languageId;

        provider.analyze(code, language);
    });

    context.subscriptions.push(disposable);
}

class AIReviewViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'ai-code-reviewer.view';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview('Select a file and click "Analyze" to start.');
    }

    public async analyze(code: string, language: string) {
        if (!this._view) {
            return;
        }

        this._view.webview.html = this._getHtmlForWebview('Analyzing code...', true);

        try {
            const report = await this._analyzeCode(code, language);
            this._view.webview.html = this._getHtmlForWebview(report);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
            this._view.webview.html = this._getHtmlForWebview(`Error: ${error.message}`, false);
        }
    }

    private async _analyzeCode(code: string, language: string) {
        const apiKey = vscode.workspace.getConfiguration('aiCodeReviewer').get<string>('apiKey');
        if (!apiKey) {
            throw new Error('Please set your Gemini API Key in VS Code settings (aiCodeReviewer.apiKey)');
        }

        const ai = new GoogleGenAI({ apiKey });
        const model = "gemini-3.1-pro-preview";
        
        const prompt = `You are a Senior Software Engineer and Security Auditor. Review this ${language} code.
        Provide a detailed report in JSON format. Include an analysis of the overall time and space complexity of the provided code.
        Also provide specific suggestions on how to improve the time or space complexity if possible.
        
        Code to Analyze:
        ${code}`;

        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                systemInstruction: "You are a professional code reviewer. Output only valid JSON.",
                responseMimeType: "application/json"
            }
        });

        return response.text;
    }

    private _getHtmlForWebview(content: any, isLoading: boolean = false) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AI Code Review</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    body { background-color: transparent; color: var(--vscode-foreground); font-family: var(--vscode-font-family); padding: 10px; font-size: var(--vscode-font-size); }
                    .card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-sideBar-border); border-radius: 8px; padding: 15px; margin-bottom: 15px; }
                    .badge { font-size: 9px; font-weight: bold; padding: 1px 6px; border-radius: 3px; text-transform: uppercase; }
                    .severity-high { background: #450a0a; color: #f87171; border: 1px solid #7f1d1d; }
                    .severity-medium { background: #451a03; color: #fbbf24; border: 1px solid #78350f; }
                    .severity-low { background: #064e3b; color: #34d399; border: 1px solid #064e3b; }
                    pre { background: var(--vscode-editor-background); padding: 8px; border-radius: 4px; overflow-x: auto; }
                </style>
            </head>
            <body>
                <div id="root">
                    ${isLoading ? `
                        <div class="flex flex-col items-center justify-center h-64">
                            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-4"></div>
                            <p class="text-xs opacity-70">${content}</p>
                        </div>
                    ` : typeof content === 'string' && (content.startsWith('Error') || content.includes('Analyze')) ? `
                        <div class="p-4 opacity-70 text-center text-xs">
                            ${content}
                        </div>
                    ` : this._renderReport(JSON.parse(content))}
                </div>
            </body>
            </html>
        `;
    }

    private _renderReport(report: any) {
        return `
            <div class="card">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="text-sm font-bold">Overview</h2>
                    <div class="text-xl font-bold text-emerald-500">${report.score}<span class="text-[10px] opacity-50">/100</span></div>
                </div>
                <p class="italic text-xs opacity-70 mb-3">"${report.summary}"</p>
                <div class="grid grid-cols-2 gap-2 pt-3 border-t border-white/10">
                    <div>
                        <div class="text-[8px] uppercase tracking-widest opacity-50 mb-1">Time</div>
                        <div class="text-emerald-500 font-mono text-[10px]">${report.timeComplexity}</div>
                    </div>
                    <div>
                        <div class="text-[8px] uppercase tracking-widest opacity-50 mb-1">Space</div>
                        <div class="text-emerald-500 font-mono text-[10px]">${report.spaceComplexity}</div>
                    </div>
                </div>
                <div class="mt-3 pt-3 border-t border-white/10">
                    <div class="text-[8px] uppercase tracking-widest opacity-50 mb-1">Strategy</div>
                    <p class="text-[10px] opacity-70">${report.complexitySuggestions}</p>
                </div>
            </div>

            <h3 class="text-[10px] font-mono opacity-50 uppercase tracking-widest mb-3">Findings</h3>
            ${report.issues.map((issue: any) => `
                <div class="card !p-3">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex gap-1">
                            <span class="badge severity-${issue.severity.toLowerCase()}">${issue.severity}</span>
                            <span class="badge bg-white/5 text-white/50 border border-white/10">${issue.category}</span>
                        </div>
                        <span class="text-[10px] font-mono opacity-50">L${issue.line}</span>
                    </div>
                    <h4 class="font-semibold text-xs mb-1">${issue.label}</h4>
                    <p class="text-[10px] opacity-70 mb-2">${issue.explanation}</p>
                    <div class="bg-black/20 rounded p-2 border border-white/5">
                        <div class="text-[8px] uppercase text-emerald-500 mb-1">Fix</div>
                        <pre class="text-[10px] text-white/80"><code>${this._escapeHtml(issue.suggestion)}</code></pre>
                    </div>
                </div>
            `).join('')}
        `;
    }

    private _escapeHtml(unsafe: string) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
}
