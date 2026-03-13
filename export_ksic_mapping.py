import pandas as pd
from sqlalchemy import create_engine

# Deepnote 환경변수 또는 직접 입력
DB_URL = "postgresql://유저:비번@호스트:포트/DB명"

engine = create_engine(DB_URL)

df = pd.read_sql(
    "SELECT * FROM backend.pdeck_industry_category_kostat_category",
    engine
)

# utf-8-sig = 한글 깨짐 없이 Excel/일반 뷰어에서 열림
df.to_csv("ksic_pdeck_mapping.csv", index=False, encoding="utf-8-sig")

print(f"저장 완료: {len(df)}행")
print(df.head())
