import re

file_path = '/Users/apple/Desktop/costapeptides/src/components/admin/AnalyticsDashboard.js'

with open(file_path, 'r') as f:
    content = f.read()

# Replace inline fontSize with standardized classNames.
# But since they are inside style={{ ... }}, it's safer to just change the value of fontSize.
# For example: fontSize: '0.65rem' -> fontSize: '0.75rem' (text-xs)
# fontSize: '0.7rem', '0.72rem', '0.75rem', '0.78rem' -> fontSize: '0.875rem' (text-sm)
# fontSize: '0.8rem', '0.82rem', '0.85rem' -> fontSize: '1rem' (text-base)
# fontSize: '0.9rem', '0.95rem' -> fontSize: '1.125rem' (text-lg)
# fontSize: '1.05rem', '1.1rem', '1.15rem', '1.2rem', '1.25rem' -> fontSize: '1.25rem' (text-xl)
# fontSize: '1.3rem', '1.6rem', '2rem' -> fontSize: '1.5rem' (text-2xl)

def map_font_size(match):
    val = match.group(1)
    
    # Extract number
    num_match = re.search(r'([\d\.]+)', val)
    if not num_match:
        return match.group(0)
    
    num = float(num_match.group(1))
    
    # Scale:
    if num < 0.75:
        new_val = '0.75rem'
    elif num < 0.85:
        new_val = '0.875rem'
    elif num < 0.95:
        new_val = '1rem'
    elif num < 1.15:
        new_val = '1.125rem'
    elif num < 1.35:
        new_val = '1.25rem'
    else:
        new_val = '1.5rem'
        
    return f"fontSize: '{new_val}'"

new_content = re.sub(r"fontSize:\s*'([^']+)'", map_font_size, content)

# Normalize some buttons
new_content = new_content.replace(
    '''<button 
                onClick={() => setExplainerTopic(null)}
                style={{
                  background: '#38bdf8',
                  color: '#0f172a',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = 0.9}
                onMouseLeave={(e) => e.currentTarget.style.opacity = 1}
              >''',
    '''<button 
                onClick={() => setExplainerTopic(null)}
                className="admin-btn admin-btn-primary"
              >'''
)

new_content = new_content.replace(
    '''<button 
                onClick={() => setExplainerTopic(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: 'none',
                  color: '#94a3b8',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = '#94a3b8'; }}
              >''',
    '''<button 
                onClick={() => setExplainerTopic(null)}
                className="admin-btn admin-btn-secondary"
                style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0 }}
              >'''
)

with open(file_path, 'w') as f:
    f.write(new_content)
print("Done")
