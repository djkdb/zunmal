"""나눔스퀘어라운드 본문 글꼴을 앱에 필요한 글자만 남겨 woff2로 만든다.

원본(@kfonts/nanum-square-round, OFL)은 한글 11,172자 전부라 두께마다 약 230KB다.
KS X 1001 완성형 2,350자 + 앱 코드에 나오는 한글 + 라틴/문장부호만 남기면 두께마다 약 1/3.
빠진 드문 글자는 CSS 글꼴 목록의 다음 글꼴(Pretendard)로 그려진다.

글자를 바꿀 일이 있을 때만 다시 실행한다:  pip install fonttools brotli && python3 scripts/subset-fonts.py
"""
import pathlib
import re

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'node_modules/@kfonts/nanum-square-round'
OUT = ROOT / 'src/assets/fonts'
WEIGHTS = {'400': 'NanumSquareRoundR', '800': 'NanumSquareRoundEB'}  # 600 이상(버튼 700 포함)은 모두 800 파일 — 비교 시안 A의 굵기

chars = set()
# KS X 1001 완성형 한글 2,350자
for hi in range(0xB0, 0xC9):
    for lo in range(0xA1, 0xFF):
        try:
            chars.add(bytes([hi, lo]).decode('euc-kr'))
        except UnicodeDecodeError:
            pass
# 앱 코드·문서에 실제로 나오는 한글 (완성형 밖 글자 포함)
for path in list((ROOT / 'src').rglob('*.ts*')) + [ROOT / 'index.html']:
    chars.update(re.findall(r'[가-힣ㄱ-ㆎ]', path.read_text(encoding='utf-8')))
# 자모, 라틴·숫자·문장부호, 자주 쓰는 기호
chars.update(chr(c) for c in range(0x3131, 0x318F))
chars.update(chr(c) for c in range(0x20, 0x7F))
chars.update(chr(c) for c in range(0xA0, 0x100))
chars.update('‐‑–—‘’“”…·•※○●◎◇◆□■△▲▽▼☆★♡♥♪♫〈〉《》「」『』【】〜～！？（），．：；％＋－')

OUT.mkdir(parents=True, exist_ok=True)
text = ''.join(sorted(chars))
for weight, name in WEIGHTS.items():
    options = subset.Options()
    options.flavor = 'woff2'
    options.hinting = False  # 폰 화면(고해상도)에서는 힌팅이 거의 쓸모없고 크기만 차지한다
    options.desubroutinize = True
    options.notdef_outline = True
    font = subset.load_font(str(SRC / f'{name}.woff2'), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    dest = OUT / f'nanum-square-round-{weight}.woff2'
    subset.save_font(font, str(dest), options)
    print(dest.relative_to(ROOT), dest.stat().st_size // 1024, 'KB')
print(len(text), 'chars')
