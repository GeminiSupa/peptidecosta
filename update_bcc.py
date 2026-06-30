import os

directory = 'src/app/api'
for root, dirs, files in os.walk(directory):
    for file in files:
        if file.endswith('.js'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
            
            if 'transporter.sendMail({' in content:
                # Replace to add bcc just after the opening brace
                new_content = content.replace(
                    'transporter.sendMail({', 
                    "transporter.sendMail({\n            bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',"
                )
                if content != new_content:
                    with open(filepath, 'w') as f:
                        f.write(new_content)
                    print(f"Updated {filepath}")
