# 마프대란 알리미 트래커

서버 없이 굴러가는 마이프로틴 할인율 추적 사이트입니다.
기본 할인율은 자동 수집을 시도하고, 배너에 안 걸리는 숨은 할인은
직접 등록합니다. 둘을 합친 실질 할인율이 대란 판정 기준입니다.

## 사람이 고치는 파일은 두 개뿐입니다

    data/site.json           사이트 설정 (도메인, 단톡방, 제휴 링크, 네이버 인증값)
    data/discount.json       할인 데이터 (매일 할인율, 숨은 할인, 할인코드)

나머지는 전부 `scripts/build.mjs` 가 자동으로 만듭니다. 직접 고치지 마십시오.

    index.html               오늘 실질 할인율 (메인)
    code.html                마이프로틴 할인코드 페이지
    calc.html                마이프로틴 할인 계산기 (메인에도 같은 계산기가 들어갑니다)
    price.html               대란 가격 비교 (data/discount.json 의 products)
    taste.html               맛 추천 등급표 (data/taste.json)
    daeran.html              전체 대란 기록 + 월별 목록
    daeran-2026-09.html      월별 대란 페이지 (데이터가 있는 달마다 자동 생성)
    sitemap.xml, rss.xml     검색엔진 제출용
    robots.txt, CNAME        도메인에 맞춰 자동 생성

그 밖의 파일:

    admin.html               브라우저에서 할인 데이터를 고치는 편집기
    og.png                   카톡·네이버 공유 미리보기 이미지 (1200x630)
    scripts/collect.mjs      기본 할인율 자동 수집 시도 (하루 4회)

## 노리는 검색어와 담당 페이지

| 검색어 | 페이지 |
|---|---|
| 마이프로틴 할인코드, 마이프로틴 할인코드 10월 | code.html (제목의 "N월"이 매달 자동으로 바뀝니다) |
| 마이프로틴 10월 대란, 마이프로틴 11월 대란 | daeran-YYYY-MM.html |
| 마프대란, 마이프로틴 대란, 오늘 마이프로틴 할인율 | index.html |
| 마이프로틴 대란 날짜, 마이프로틴 대란 주기 | daeran.html |
| 마이프로틴 할인 계산기, 마이프로틴 최종 결제금액 | calc.html |
| 마이프로틴 대란 가격 차이, 대란 가격 비교, 임팩트웨이 가격 | price.html |
| 마이프로틴 맛 추천, 맛 순위, 맛 종류, 맛 후기 | taste.html |
| 마이프로틴 할인코드 중복, 추천인 코드 입력, 쇼핑지원금 | code.html (FAQ와 섹션) |

월말 10일 동안은 다음 달 대란 페이지를 미리 만듭니다. "마이프로틴 11월 대란"
검색은 10월 말부터 생기기 때문입니다. 그 달이 시작되면 같은 주소에 실제 기록이
채워집니다.

### data/taste.json (맛 추천 페이지)

`tiers` 의 각 등급 `flavors` 에 `{ "name": "내추럴 초콜렛", "product": "임팩트 웨이", "note": "한 줄 평" }`
을 넣으면 등급표가 생깁니다. 비어 있는 등급은 페이지에 안 나옵니다. `catalog` 는 지금 파는 맛 목록,
`comments` 는 영상 댓글 한 줄 평(`good` true/false)입니다. 고치면 `updated` 날짜도 같이 바꾸십시오.

## 처음 올리는 법 (명령어 없이)

1. github.com 에서 New repository, 이름은 marp-daeran, Public 선택
2. Add file → Upload files 에서 이 폴더의 파일을 전부 끌어다 놓기
   (.github 폴더가 안 올라가면 Create new file 로 경로에
   `.github/workflows/track.yml` 을 직접 입력해 내용을 붙여넣기)
3. Settings → Actions → General → Workflow permissions 에서
   Read and write permissions 선택 후 저장
4. Settings → Pages 에서 Source 를 main 브랜치로 지정
5. 몇 분 뒤 https://krdugong.github.io/marp-daeran 에서 확인

## 도메인 연결하는 법

도메인을 산 다음 네이버에 등록하십시오. 순서를 바꾸면 네이버에 두 번 등록해야 합니다.

1. `data/site.json` 의 `domain` 에 산 도메인을 적습니다. 예: `"domain": "marpdaeran.com"`
   (https:// 없이). 커밋하면 모든 주소와 CNAME 파일이 그 도메인으로 바뀝니다.
2. 도메인을 산 곳(가비아, 후이즈, 카페24 등)의 DNS 설정에 아래를 넣습니다.

       A      @     185.199.108.153
       A      @     185.199.109.153
       A      @     185.199.110.153
       A      @     185.199.111.153
       CNAME  www   krdugong.github.io

3. 깃허브 저장소 Settings → Pages → Custom domain 에 도메인이 들어가 있는지 확인하고,
   인증서가 준비되면 Enforce HTTPS 를 켭니다 (DNS 반영까지 몇 시간 걸릴 수 있습니다).
4. 예전 krdugong.github.io/marp-daeran 주소는 깃허브가 새 도메인으로 자동으로 넘겨줍니다.

## 네이버 서치어드바이저 등록하는 법

1. searchadvisor.naver.com → 웹마스터 도구 → 사이트 등록에 `https://도메인` 입력
2. 소유확인에서 HTML 태그를 고르면 `<meta name="naver-site-verification" content="abc123...">`
   가 나옵니다. content 값(따옴표 안)만 복사해 `data/site.json` 의 `naverVerify` 에 넣고 커밋
3. 몇 분 뒤 사이트가 다시 생성되면 네이버에서 소유확인 버튼을 누릅니다
4. 요청 → 사이트맵 제출에 `https://도메인/sitemap.xml`
5. 요청 → RSS 제출에 `https://도메인/rss.xml`
   (새 월별 페이지가 생기면 RSS로 네이버가 빨리 알아챕니다)
6. 요청 → 웹 페이지 수집에 메인, code.html, 이번 달 대란 페이지 주소를 하나씩 넣습니다
7. 구글도 같은 방식입니다. search.google.com/search-console 에서 HTML 태그 값을
   `googleVerify` 에 넣고 sitemap.xml 을 제출하십시오.

네이버 검색 노출은 등록 후 보통 몇 주가 걸립니다. 블로그·카페 글이 상위를 많이
차지하는 검색어라, 네이버 블로그나 유튜브 설명란에서 이 사이트로 링크를 걸어 두면
도움이 됩니다.

## 매일 쓰는 법

자동 수집이 잘 돌면 손댈 일이 거의 없습니다. 수집이 실패했거나
숨은 할인을 찾았을 때만 admin.html을 씁니다.

1. admin.html 을 브라우저로 엽니다
2. 기본 할인율이 자동으로 안 잡혔으면 직접 입력합니다.
   숨은 할인은 항상 여기서 등록합니다.
3. JSON 복사를 누릅니다
4. 깃허브에서 data/discount.json 을 열고 연필 아이콘, 전체 선택 후 붙여넣기
5. Commit changes 를 누르면 몇 분 뒤 사이트가 갱신됩니다

한 번 등록한 숨은 할인은 기간이 끝날 때까지 매일 자동으로 반영됩니다.

할인코드(말왕, 팬카페 등)를 바꾸려면 깃허브에서 `data/discount.json` 의
`codes` 부분을 직접 고치십시오. 형식은 `{ "label": "이름", "code": "코드", "rate": 36, "note": "설명" }` 입니다.
`"primary": true` 인 코드가 메인 버튼과 화면 아래 고정 버튼에 들어가고,
`"official": true` 인 코드와 비교해 "공식보다 +1%p" 배지가 자동으로 붙습니다.
`"until": "2026-10-30"` 을 넣으면 그 날짜가 지나면 자동으로 숨겨집니다.

### discount.json 의 나머지 항목

- `hiddenCodeBonus`: 자동 수집은 공식 배너 코드만 읽을 수 있어서, 여기 적은 만큼(%p)을
  더해 히든코드 할인율로 기록합니다. 히든코드가 공식보다 2%p 높으면 2로 바꾸십시오.
- `history`: 매일 기록을 시작하기 전의 대란과 유튜브 영상입니다. 새 영상을 올리면 해당
  날짜 항목의 `videos` 에 `{ "id": "영상ID", "date": "2026-11-11", "title": "제목" }` 을
  추가하십시오. 그 달 대란 페이지에 영상 목록이 자동으로 생깁니다. 대란이 아닌 영상은
  `"daeran": false` 로 넣습니다.
- `products` + `priceDate`: 대란 가격 비교표(price.html, 메인)에 쓰는 대표 제품입니다. `price` 는 할인코드가
  적용되는 **표시가**(화면에 보이는 가격), `rrp` 는 줄 그어진 정가입니다. 마이프로틴 제품 페이지에서 맛별로
  가장 흔한 표시가를 골라 넣고, 바꿨으면 `priceDate` 도 같이 고치십시오. 표의 평소/대란 가격은
  오늘 코드 할인율과 지난 대란 평균 코드 할인율로 자동 계산됩니다.
- `shop`: 계산기가 쓰는 무료배송 기준(원), 관세 기준(달러), 어림 환율입니다.
- `deals` 의 계산기용 항목: 정액 할인(쇼핑지원금 등)은 `"type": "amount", "amount": 5000, "min": 120000`
  처럼 적습니다. `min` 은 할인코드를 적용한 뒤 금액 기준입니다. `calcLabel` 은 계산기 체크박스에
  보이는 문구입니다. `type` 이 없으면 % 할인(`rate`)으로 계산하고, 할인코드와 정액 할인을 뺀 뒤 마지막에 적용합니다.
- 대란 판정은 할인코드 할인율(히든코드 기준)이 `threshold` 이상인 날입니다. 숨은 할인을
  합친 값은 "실제로 받는 할인"으로만 보여줍니다.

## 배포 전 고칠 것

1. data/discount.json 의 예시 데이터를 실제 값으로 교체
   교체 전까지 페이지 위에 노란 경고가 표시됩니다
2. `codes` 의 HORSEKING, FANCAFE 가 실제로 쓸 수 있는 코드인지 확인
3. scripts/collect.mjs 의 SOURCE.url 과 pattern 을 확인합니다.
   `node scripts/collect.mjs --dry` 로 어떤 숫자가 잡히는지 먼저 확인하십시오.
   할인 표기가 상품 세일과 코드 할인이 섞여 나오는 경우가 많아
   엉뚱한 숫자를 집을 수 있습니다.

## 자동 수집에 대해

`scripts/collect.mjs`는 하루 4회 실행됩니다. 실패해도 페이지 생성은
계속됩니다(`continue-on-error`). 마이프로틴 페이지 구조가 바뀌면
정규식이 안 맞을 수 있으니, 값이 이상해 보이면 `--dry`로 먼저 확인하고
admin.html에서 직접 고치십시오. 숨은 할인은 배너에 안 걸리는 조건이라
애초에 자동으로 잡을 수 없어 항상 직접 등록해야 합니다.

## 명령어 (터미널을 쓸 경우)

    node scripts/collect.mjs --dry   수집 시험 실행, 저장하지 않음
    node scripts/collect.mjs 41      기본 할인율 41%로 수동 기록
    node scripts/collect.mjs         자동 수집 시도 후 기록
    node scripts/build.mjs           HTML 다시 생성

## 계산 방식

실질 할인율은 기본 할인 위에 숨은 할인을 쌓아 계산합니다.

    곱해서 적용:  1 - (1 - 기본) x (1 - 추가)
    단순 더하기:  기본 + 추가

## 디자인 톤

마이프로틴 브랜드색을 씁니다. 딥틸 `#003942`(버튼·강조), 오렌지 `#DD592B`(대란·경고),
민트 `#94E5B5`(작은 포인트), 웜 오프화이트 `#F6F5F2`(카드 배경). 레이아웃은 애플 스타일로
테두리 대신 연한 배경 카드, 둥근 모서리 18px, 알약 버튼, 반투명 고정 헤더를 씁니다.
색은 `scripts/build.mjs` 의 `:root` 변수에서 한 번에 바꿀 수 있습니다.
