# 마프대란 알리미 트래커

서버 없이 굴러가는 마이프로틴 가격 추적 사이트입니다.
핵심 지표는 "1회분(서빙)당 가격"입니다. 여러 상품을 동시에 추적하고,
그 중 하나를 대표 상품(홈 화면)으로 지정합니다. 모든 페이지에
"전체 할인 보기" 토글이 있어 등록된 상품을 검색하고 오갈 수 있습니다.

## 파일 구조

    data/products.json      유일한 원본 데이터. 상품 여러 개를 담습니다
    admin.html               브라우저에서 가격을 기록하는 편집기
    scripts/build.mjs        JSON을 읽어 HTML 생성
    index.html               생성물(대표 상품). 직접 고치지 마십시오
    daeran.html               생성물(대표 상품의 전체 기록). 직접 고치지 마십시오
    products/슬러그.html      생성물(대표 상품 외 나머지). 직접 고치지 마십시오

## 데이터 구조

    {
      "codes": [...],
      "referral": "...",
      "products": [
        {
          "slug": "impact-whey-2-7kg",
          "name": "임팩트 웨이 프로틴 2.7kg",
          "defaultServings": 90,
          "dealMarginPct": 6,
          "featured": true,
          "entries": [
            { "date": "2026-09-15", "price": 43700, "servings": 90, "note": "" }
          ]
        }
      ]
    }

`price`는 그날 실제로 결제한 총액, `servings`는 그 결제로 받는 서빙 수입니다.
1회분당 가격은 `price / servings`로 자동 계산됩니다. `slug`는 영문/숫자/
하이픈만 쓰십시오. `products/슬러그.html` 파일명이 됩니다. `featured:true`는
반드시 상품 하나에만 붙이십시오. 그 상품이 index.html이 됩니다.

판정은 네 단계입니다.

- 역대 최저가: 이전 모든 기록보다 쌉니다
- 대란가: 최근 90일 평균보다 `dealMarginPct`% 이상 쌉니다
- 평균 이하: 최근 90일 평균보다 쌉니다
- 평시가: 그 외

## 깃허브에 올리는 법 (명령어 없이)

1. github.com 에서 New repository, 이름은 marp-daeran, Public 선택
2. Add file → Upload files 에서 이 폴더의 파일을 전부 끌어다 놓기
   (.github 폴더가 안 올라가면 Create new file 로 경로에
   `.github/workflows/track.yml` 을 직접 입력해 내용을 붙여넣기)
3. Settings → Actions → General → Workflow permissions 에서
   Read and write permissions 선택 후 저장
4. Settings → Pages 에서 Source 를 main 브랜치로 지정
5. 몇 분 뒤 https://krdugong.github.io/marp-daeran 에서 확인

## 배포 전 고칠 것

1. data/products.json 의 예시 데이터를 실제 관측값으로 교체
   교체 전까지 각 상품 페이지 위에 노란 경고가 표시됩니다
2. scripts/build.mjs 상단 SITE 값 확인 (origin, kakao, affiliate 는
   이미 채워져 있습니다. naverVerify 만 서치어드바이저 등록 후 채우십시오)
3. 네이버 서치어드바이저와 구글 서치콘솔에 등록 후 sitemap.xml 제출

## 매일 쓰는 법

1. admin.html 을 브라우저로 엽니다
2. 위쪽 탭에서 상품을 고릅니다 (탭 옆 배지가 그 상품의 오늘 판정입니다)
3. 날짜, 결제금액, 서빙 수를 입력합니다. 판정과 1회분당 가격이 바로 계산됩니다
4. JSON 복사를 누릅니다
5. 깃허브에서 data/products.json 을 열고 연필 아이콘, 전체 선택 후 붙여넣기
6. Commit changes 를 누르면 몇 분 뒤 사이트가 갱신됩니다

새 상품을 추가하려면 편집기 맨 아래 "새 상품 추가"에서 상품명과 슬러그를
넣으면 됩니다. 상품마다 서빙 수와 대란 기준(%)을 따로 설정할 수 있습니다.

## 전체 할인 보기 / 검색

모든 페이지 상단에 "전체 할인 보기" 토글이 있습니다. 자바스크립트 없이도
열리는 네이티브 HTML 기능(`<details>`)이라 사이트가 느려지지 않습니다.
펼치면 등록된 상품이 전부 카드로 나오고, 검색창에 이름을 치면
그 안에서만 걸러집니다. 이건 당신이 등록한 상품 수만큼만 동작하는
가벼운 클라이언트 검색입니다. 채찍단이나 프로테이오스처럼 수백 개 상품을
서버에서 검색하는 것과는 다릅니다. 그 정도 규모가 필요해지면 별도
백엔드나 검색 서비스(Algolia 등)가 필요합니다.

## 자동 수집에 대해

자동 크롤링은 없습니다. 실제 결제금액과 서빙 수라는 두 값이 필요하고
프로모션마다 조건이 달라서 자동으로 정확히 뽑아내기 어렵습니다.
직접 확인한 값만 넣는 지금 방식이 더 정확합니다.

## 명령어 (터미널을 쓸 경우)

    node scripts/build.mjs   HTML 다시 생성
