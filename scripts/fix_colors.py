import os
import re

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    # Replace inline color: '#002766' with color: 'var(--text-primary)'
    content = re.sub(r"color:\s*['\"]#002766['\"]", "color: 'var(--text-primary)'", content)
    # Replace inline border: '2px solid #002766'
    content = re.sub(r"border:\s*['\"]([^'\"]*)#002766['\"]", r"border: '\1var(--text-primary)'", content)
    
    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

def main():
    src_dir = '/Users/apple/Desktop/costapeptides/src'
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.js') or file.endswith('.jsx') or file.endswith('.tsx'):
                filepath = os.path.join(root, file)
                replace_in_file(filepath)

if __name__ == '__main__':
    main()
