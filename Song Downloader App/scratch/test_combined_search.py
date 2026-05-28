import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import app
import json

def test_combined():
    # Setup test client
    client = app.test_client()
    
    print("Testing search API under 'combined' provider...")
    response = client.get('/api/search?query=Kesariya&provider=combined')
    
    print(f"Status Code: {response.status_code}")
    data = response.get_json()
    
    if 'results' in data:
        results = data['results']
        print(f"Found {len(results)} total merged results.")
        # Print first 6 results
        for i, item in enumerate(results[:6]):
            print(f"[{i+1}] {item.get('title')} - {item.get('artist')} ({item.get('provider')})")
    else:
        print("Error response:", data)

if __name__ == "__main__":
    test_combined()
