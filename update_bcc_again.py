import os

directory = 'src/app/api'
for root, dirs, files in os.walk(directory):
    for file in files:
        if file.endswith('.js'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
            
            if "'omerforce@gmail.com'" in content:
                new_content = content.replace(
                    "'omerforce@gmail.com'", 
                    "'omerforce@gmail.com, elainedrb@gmail.com'"
                )
                if content != new_content:
                    with open(filepath, 'w') as f:
                        f.write(new_content)
                    print(f"Updated {filepath}")
