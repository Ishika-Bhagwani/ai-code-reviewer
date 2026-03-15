export async function analyzeCode(code: string, language: string) {

const response = await fetch("/api/analyze", {
method: "POST",
headers: {
"Content-Type": "application/json"
},
body: JSON.stringify({
code,
language
})
});

return await response.json();

}
