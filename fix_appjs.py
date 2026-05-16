
with open('./public/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Count escaped backticks (backslash + backtick)
escaped_backtick_count = content.count('\\`')
escaped_dollar_count = content.count('\\${')
print(f"Escaped backticks: {escaped_backtick_count}")
print(f"Escaped dollar-brace: {escaped_dollar_count}")

# Show first 10 lines that have escaped backticks
lines = content.split('\n')
for i, line in enumerate(lines):
    if '\\`' in line:
        print(f"Line {i+1}: {repr(line[:120])}")
