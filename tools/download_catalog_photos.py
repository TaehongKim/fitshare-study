"""Cache official catalog photos; never generate replacement product images."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import hashlib

ROOT = Path(__file__).resolve().parents[1]


def download(item):
    folder = ROOT / 'server-data' / 'garments' / item['id']
    folder.mkdir(exist_ok=True)
    target = folder / 'photo.jpg'
    temporary = folder / 'photo.download.jpg'
    completed = subprocess.run(['curl.exe', '--fail', '--silent', '--show-error', '-L',
                                '--connect-timeout', '10', '--max-time', '25',
                                item['sourceImageUrl'], '-o', str(temporary)], capture_output=True)
    photo = temporary.read_bytes() if temporary.exists() else b''
    valid = completed.returncode == 0 and photo.startswith(b'\xff\xd8') and photo.endswith(b'\xff\xd9')
    if item.get('imageReviewSha256'):
        valid = valid and hashlib.sha256(photo).hexdigest() == item['imageReviewSha256']
    if valid:
        temporary.replace(target)
    elif temporary.exists():
        temporary.unlink()
    return item['productCode'], valid


if __name__ == '__main__':
    catalog = json.loads((ROOT / 'data' / 'schoolCatalog.json').read_text(encoding='utf-8'))
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(download, catalog))
        for code, valid in results:
            print(code, 'OK' if valid else 'FAILED', flush=True)
    if not all(valid for _, valid in results):
        raise SystemExit('Download failed or image changed: manual garment-only review is required.')
