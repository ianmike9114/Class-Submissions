// One place for every per-language fact the Code assignment needs, so the
// student form, teacher review card and runner never disagree.
// `mode: "run"` = sent to Wandbox (js/runner.js); `"preview"` = rendered in a
// sandboxed iframe (js/webpreview.js), never sent anywhere.
export const CODE_LANGS = {
  java: {
    label: "Java",
    hl: "java",
    accept: ".java,.txt,text/plain",
    mode: "run",
    compiler: "openjdk-jdk-21+35",
    placeholder: "public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"Hello\");\n  }\n}",
    hint: "Type/paste your code above, or pick a .java file. Keep your public class named Main so it runs.",
  },
  csharp: {
    label: "C#",
    hl: "csharp",
    accept: ".cs,.txt,text/plain",
    mode: "run",
    // dotnetcore-8 on Wandbox fails to build (checked 2026-11-27); mono works
    // with Console.ReadLine (stdin) and System.IO files.
    compiler: "mono-6.12.0.199",
    placeholder: "using System;\n\nclass Program {\n  static void Main() {\n    Console.WriteLine(\"Hello\");\n  }\n}",
    hint: "Type/paste your C# code above, or pick a .cs file. Put your code inside class Program { static void Main() { ... } }.",
  },
  web: {
    label: "Web page (HTML, CSS, JavaScript)",
    hl: "xml",
    accept: ".html,.htm,.txt,text/html,text/plain",
    mode: "preview",
    placeholder: "<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    h1 { color: teal; }\n  </style>\n</head>\n<body>\n  <h1>Hello</h1>\n  <script>\n    console.log(\"Hi!\");\n  </script>\n</body>\n</html>",
    hint: "Put your HTML, CSS (inside <style>) and JavaScript (inside <script>) in one box, or pick an .html file. Tap Preview to see your page.",
  },
};

export function langOf(assignment) {
  const l = assignment && assignment.codeLang;
  return Object.prototype.hasOwnProperty.call(CODE_LANGS, l) ? l : "java";
}
