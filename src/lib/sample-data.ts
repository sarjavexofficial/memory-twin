import { daysAgoLocal } from '@/lib/date';
import { JournalEntry } from '@/lib/journal-data';
import { Person } from '@/lib/mock-data';
import { Language } from '@/store/settings-context';

// サンプルデータ（初回起動時に「使い方」を伝えるためのデモ）。
// sample: true が付いている間は表示言語に追従して差し替わる。
// ユーザーが編集した時点でフラグが外れ、以降は本人のデータとして固定される。

// ---- サンプル人物 ----

type PersonTexts = {
  name: string;
  relation: string;
  birthday: string;
  likes: string[];
  dislikes: string[];
  tags: string[]; // 人物タグ（分類・横断検索のデモを兼ねる）
  place: string;
  memos: string[];
  promiseAction: string; // 3人目の最新メモに付く「約束」（Today Recallのデモを兼ねる）
};

// 言語に依存しない骨格。ID・絵文字・日付は全言語で共通（言語を切り替えても同じ人物として扱う）
const PERSON_SKELETON = [
  { id: '1', avatarEmoji: '🌸', lastContact: '2026-06-28', memoDates: ['2026-06-28', '2026-05-02', '2026-03-10'] },
  { id: '2', avatarEmoji: '⚽', lastContact: '2026-07-01', memoDates: ['2026-07-01', '2026-04-15'] },
  { id: '3', avatarEmoji: '💼', lastContact: '2026-05-20', memoDates: ['2026-05-20', '2026-02-14'] },
  { id: '4', avatarEmoji: '📷', lastContact: '2026-04-10', memoDates: ['2026-04-10'] },
];
// サンプルの約束の期限は常に「3日後」。固定日付だと時間の経過で永久に期限切れのまま
// デモが古びてしまう（refreshSamplePeopleが起動ごとにテンプレートから作り直すので毎回追従する）
const promiseDue = () => daysAgoLocal(-3);

const PEOPLE_TEXTS: Record<Language, PersonTexts[]> = {
  ja: [
    {
      name: '高橋 さくら',
      relation: '大学の同期',
      birthday: '3月14日',
      likes: ['猫', 'カフェ巡り', '洋画'],
      dislikes: ['虫'],
      tags: ['大学', '友人'],
      place: '渋谷のカフェ',
      memos: [
        '猫を飼い始めたと言っていた。名前は「もち」。',
        '来月旅行に行く予定と話していた。',
        '就活が終わって、IT企業に内定したと報告してくれた。',
      ],
      promiseAction: '出張の感想を聞く',
    },
    {
      name: '佐藤 健太',
      relation: 'サークルの後輩',
      birthday: '11月2日',
      likes: ['サッカー', 'コーヒー'],
      dislikes: ['辛い食べ物'],
      tags: ['サークル', '後輩'],
      place: '大学の食堂',
      memos: [
        'コーヒーが好きで、最近ハンドドリップを始めたらしい。',
        '就職活動で営業職を志望していると話していた。',
      ],
      promiseAction: '出張の感想を聞く',
    },
    {
      name: '田中 美咲',
      relation: '職場の先輩',
      birthday: '8月20日',
      likes: ['旅行', 'ワイン'],
      dislikes: [],
      tags: ['職場', '先輩'],
      place: 'オフィス',
      memos: [
        '来月、出張に行くと話していた。',
        'ワイン好きで、休日はワイナリー巡りをしているらしい。',
      ],
      promiseAction: '出張の感想を聞く',
    },
    {
      name: '鈴木 陽菜',
      relation: '高校の友人',
      birthday: '1月30日',
      likes: ['写真', '登山'],
      dislikes: ['高いところ（でも登山は好きらしい）'],
      tags: ['高校', '友人'],
      place: 'オンライン通話',
      memos: ['新しいカメラを買ったと言っていた。'],
      promiseAction: '出張の感想を聞く',
    },
  ],
  en: [
    {
      name: 'Emily Carter',
      relation: 'College friend',
      birthday: 'March 14',
      likes: ['Cats', 'Café hopping', 'Movies'],
      dislikes: ['Bugs'],
      tags: ['College', 'Friend'],
      place: 'Café downtown',
      memos: [
        'Said she got a cat. Its name is Mochi.',
        'Mentioned she is planning a trip next month.',
        'Told me she landed a job offer at an IT company.',
      ],
      promiseAction: 'Ask how the business trip went',
    },
    {
      name: 'Jake Miller',
      relation: 'Club junior',
      birthday: 'November 2',
      likes: ['Soccer', 'Coffee'],
      dislikes: ['Spicy food'],
      tags: ['Club', 'Junior'],
      place: 'Campus cafeteria',
      memos: [
        'Loves coffee — recently got into hand-drip brewing.',
        'Said he is aiming for a sales position in his job hunt.',
      ],
      promiseAction: 'Ask how the business trip went',
    },
    {
      name: 'Olivia Bennett',
      relation: 'Senior at work',
      birthday: 'August 20',
      likes: ['Travel', 'Wine'],
      dislikes: [],
      tags: ['Work', 'Senior'],
      place: 'Office',
      memos: [
        'Said she has a business trip next month.',
        'A wine lover — spends weekends visiting wineries.',
      ],
      promiseAction: 'Ask how the business trip went',
    },
    {
      name: 'Chloe Adams',
      relation: 'High school friend',
      birthday: 'January 30',
      likes: ['Photography', 'Hiking'],
      dislikes: ['Heights (still loves hiking)'],
      tags: ['High school', 'Friend'],
      place: 'Video call',
      memos: ['Said she bought a new camera.'],
      promiseAction: 'Ask how the business trip went',
    },
  ],
  zh: [
    {
      name: '王小雨',
      relation: '大学同学',
      birthday: '3月14日',
      likes: ['猫', '逛咖啡馆', '电影'],
      dislikes: ['虫子'],
      tags: ['大学', '朋友'],
      place: '市中心的咖啡馆',
      memos: [
        '说开始养猫了，名字叫“年糕”。',
        '说下个月打算去旅行。',
        '告诉我拿到了一家IT公司的offer。',
      ],
      promiseAction: '问问出差的感受',
    },
    {
      name: '李强',
      relation: '社团学弟',
      birthday: '11月2日',
      likes: ['足球', '咖啡'],
      dislikes: ['辣的食物'],
      tags: ['社团', '学弟'],
      place: '学校食堂',
      memos: ['很喜欢咖啡，最近开始玩手冲。', '说求职想做销售岗位。'],
      promiseAction: '问问出差的感受',
    },
    {
      name: '陈静',
      relation: '公司前辈',
      birthday: '8月20日',
      likes: ['旅行', '红酒'],
      dislikes: [],
      tags: ['公司', '前辈'],
      place: '办公室',
      memos: ['说下个月要出差。', '爱红酒，周末常去酒庄。'],
      promiseAction: '问问出差的感受',
    },
    {
      name: '张悦',
      relation: '高中朋友',
      birthday: '1月30日',
      likes: ['摄影', '爬山'],
      dislikes: ['恐高（但还是喜欢爬山）'],
      tags: ['高中', '朋友'],
      place: '线上通话',
      memos: ['说买了新相机。'],
      promiseAction: '问问出差的感受',
    },
  ],
  ko: [
    {
      name: '김서연',
      relation: '대학 동기',
      birthday: '3월 14일',
      likes: ['고양이', '카페 투어', '영화'],
      dislikes: ['벌레'],
      tags: ['대학', '친구'],
      place: '시내 카페',
      memos: [
        '고양이를 키우기 시작했다고 한다. 이름은 "모찌".',
        '다음 달 여행을 갈 계획이라고 했다.',
        '취업 활동이 끝나고 IT 기업에 합격했다고 알려 줬다.',
      ],
      promiseAction: '출장 소감 물어보기',
    },
    {
      name: '박민준',
      relation: '동아리 후배',
      birthday: '11월 2일',
      likes: ['축구', '커피'],
      dislikes: ['매운 음식'],
      tags: ['동아리', '후배'],
      place: '학생 식당',
      memos: ['커피를 좋아해서 최근 핸드드립을 시작했다고 한다.', '취업에서 영업직을 지망한다고 했다.'],
      promiseAction: '출장 소감 물어보기',
    },
    {
      name: '이지은',
      relation: '회사 선배',
      birthday: '8월 20일',
      likes: ['여행', '와인'],
      dislikes: [],
      tags: ['회사', '선배'],
      place: '사무실',
      memos: ['다음 달 출장을 간다고 했다.', '와인을 좋아해서 주말마다 와이너리를 다닌다고 한다.'],
      promiseAction: '출장 소감 물어보기',
    },
    {
      name: '최수아',
      relation: '고등학교 친구',
      birthday: '1월 30일',
      likes: ['사진', '등산'],
      dislikes: ['높은 곳(그래도 등산은 좋아함)'],
      tags: ['고등학교', '친구'],
      place: '화상 통화',
      memos: ['새 카메라를 샀다고 했다.'],
      promiseAction: '출장 소감 물어보기',
    },
  ],
  fr: [
    {
      name: 'Camille Dupont',
      relation: 'Amie de fac',
      birthday: '14 mars',
      likes: ['Chats', 'Cafés', 'Cinéma'],
      dislikes: ['Insectes'],
      tags: ['Fac', 'Amie'],
      place: 'Café du centre',
      memos: [
        'Elle a adopté un chat. Il s’appelle « Mochi ».',
        'Elle prévoit un voyage le mois prochain.',
        'Elle m’a annoncé avoir été embauchée dans une entreprise IT.',
      ],
      promiseAction: 'Lui demander comment s’est passé le déplacement',
    },
    {
      name: 'Lucas Martin',
      relation: 'Cadet du club',
      birthday: '2 novembre',
      likes: ['Football', 'Café'],
      dislikes: ['Plats épicés'],
      tags: ['Club', 'Cadet'],
      place: 'Cafétéria du campus',
      memos: [
        'Fan de café — il s’est mis au café filtre récemment.',
        'Il vise un poste commercial pour son premier emploi.',
      ],
      promiseAction: 'Lui demander comment s’est passé le déplacement',
    },
    {
      name: 'Sophie Bernard',
      relation: 'Collègue senior',
      birthday: '20 août',
      likes: ['Voyages', 'Vin'],
      dislikes: [],
      tags: ['Travail', 'Senior'],
      place: 'Bureau',
      memos: [
        'Elle part en déplacement professionnel le mois prochain.',
        'Amatrice de vin, elle visite des domaines le week-end.',
      ],
      promiseAction: 'Lui demander comment s’est passé le déplacement',
    },
    {
      name: 'Emma Laurent',
      relation: 'Amie de lycée',
      birthday: '30 janvier',
      likes: ['Photo', 'Randonnée'],
      dislikes: ['Le vertige (mais adore la rando)'],
      tags: ['Lycée', 'Amie'],
      place: 'Appel vidéo',
      memos: ['Elle s’est acheté un nouvel appareil photo.'],
      promiseAction: 'Lui demander comment s’est passé le déplacement',
    },
  ],
  pt: [
    {
      name: 'Ana Souza',
      relation: 'Amiga da faculdade',
      birthday: '14 de março',
      likes: ['Gatos', 'Cafeterias', 'Filmes'],
      dislikes: ['Insetos'],
      tags: ['Faculdade', 'Amiga'],
      place: 'Café no centro',
      memos: [
        'Disse que adotou um gato. O nome é "Mochi".',
        'Comentou que planeja uma viagem no mês que vem.',
        'Contou que conseguiu uma vaga numa empresa de TI.',
      ],
      promiseAction: 'Perguntar como foi a viagem de trabalho',
    },
    {
      name: 'Pedro Lima',
      relation: 'Calouro do clube',
      birthday: '2 de novembro',
      likes: ['Futebol', 'Café'],
      dislikes: ['Comida apimentada'],
      tags: ['Clube', 'Calouro'],
      place: 'Refeitório do campus',
      memos: ['Adora café — começou com métodos coados recentemente.', 'Disse que quer uma vaga em vendas.'],
      promiseAction: 'Perguntar como foi a viagem de trabalho',
    },
    {
      name: 'Mariana Costa',
      relation: 'Colega sênior',
      birthday: '20 de agosto',
      likes: ['Viagens', 'Vinho'],
      dislikes: [],
      tags: ['Trabalho', 'Sênior'],
      place: 'Escritório',
      memos: ['Disse que vai viajar a trabalho no mês que vem.', 'Ama vinho — passa fins de semana visitando vinícolas.'],
      promiseAction: 'Perguntar como foi a viagem de trabalho',
    },
    {
      name: 'Beatriz Alves',
      relation: 'Amiga do colégio',
      birthday: '30 de janeiro',
      likes: ['Fotografia', 'Trilhas'],
      dislikes: ['Medo de altura (mas ama trilha)'],
      tags: ['Colégio', 'Amiga'],
      place: 'Chamada de vídeo',
      memos: ['Disse que comprou uma câmera nova.'],
      promiseAction: 'Perguntar como foi a viagem de trabalho',
    },
  ],
};

// 指定言語のサンプル人物一覧を生成する
export function samplePeopleFor(language: Language): Person[] {
  const texts = PEOPLE_TEXTS[language] ?? PEOPLE_TEXTS.ja;
  return PERSON_SKELETON.map((s, i) => {
    const t = texts[i];
    return {
      id: s.id,
      name: t.name,
      relation: t.relation,
      avatarEmoji: s.avatarEmoji,
      birthday: t.birthday,
      likes: t.likes,
      dislikes: t.dislikes,
      tags: t.tags,
      lastContact: s.lastContact,
      place: t.place,
      sample: true,
      memos: s.memoDates.map((date, j) => ({
        id: `m${j + 1}`,
        date,
        text: t.memos[j],
        // 3人目（職場の先輩）の最新メモに期限付きの約束を付け、能動メッセージのデモを成立させる
        ...(s.id === '3' && j === 0
          ? { promise: { action: t.promiseAction, dueDate: promiseDue(), done: false } }
          : {}),
      })),
    };
  });
}

// 表示言語の変更にサンプル人物だけ追従させる（編集済み＝フラグなしは触らない）
export function refreshSamplePeople(people: Person[], language: Language): Person[] {
  const templates = samplePeopleFor(language);
  return people.map((p) => (p.sample ? (templates.find((t) => t.id === p.id) ?? p) : p));
}

// 旧バージョンで保存されたシード（フラグなし）の移行。
// 名前の一致だけで判定すると、サンプル人物にメモを追加した人（sampleフラグは外れている）まで
// サンプル扱いに戻してしまい、次のサンプル刷新で追記したメモ・約束が消える。
// そのため「メモと約束まで未編集」の場合に限って引き上げる
export function markLegacySamplePeople(people: Person[]): Person[] {
  const templates = samplePeopleFor('ja');
  return people.map((p) => {
    if (p.sample) return p;
    const t = templates.find((s) => s.id === p.id);
    const untouched =
      t &&
      p.name === t.name &&
      p.memos.length === t.memos.length &&
      p.memos.every((m, i) => {
        const tm = t.memos[i];
        return (
          m.text === tm.text &&
          (m.promise?.action ?? null) === (tm.promise?.action ?? null) &&
          (m.promise?.done ?? false) === (tm.promise?.done ?? false)
        );
      });
    return untouched ? { ...p, sample: true } : p;
  });
}

// ---- サンプル日記（Timeline・今年のあなた・感情タイムラインのデモを兼ねる） ----

type JournalText = { text: string; tags: string[] };

const JOURNAL_SKELETON = [
  { id: 'j1', date: '2024-05-10', mood: 4, sleepHours: 7 },
  { id: 'j2', date: '2024-11-02', mood: 3, sleepHours: 6 },
  { id: 'j3', date: '2025-06-15', mood: 2, sleepHours: 4 },
  { id: 'j4', date: '2025-06-16', mood: 4, sleepHours: 6 },
  { id: 'j5', date: '2026-01-20', mood: 4, sleepHours: 7 },
  { id: 'j6', date: '2026-04-05', mood: 4, sleepHours: 5 },
  { id: 'j7', date: '2026-07-10', mood: 2, sleepHours: 4 },
];

const JOURNAL_TEXTS: Record<Language, JournalText[]> = {
  ja: [
    { text: '休日に写真を撮りに出かけた。構図を考えるのが楽しくて時間を忘れた。', tags: ['写真', '趣味'] },
    { text: 'カメラの使い方教室に通い始めた。基礎から学び直している。', tags: ['写真', '学び'] },
    { text: '課題がうまく進まず落ち込んだ。睡眠時間を削って作業していた。', tags: ['課題', '不調'] },
    { text: '朝散歩してから作業したら頭がすっきりした。', tags: ['運動', '課題'] },
    { text: 'SNSに撮った写真を投稿し始めた。反応をもらえると続けたくなる。', tags: ['SNS', '発信'] },
    { text: '写真教室を自分で開いてみる構想を考え始めた。ワクワクするが同時に不安もある。', tags: ['起業', '写真教室'] },
    { text: '深夜まで準備を続けてしまい、翌朝の集中力が落ちた。', tags: ['準備', '不調'] },
  ],
  en: [
    { text: 'Went out to shoot photos on my day off. Lost track of time playing with composition.', tags: ['Photography', 'Hobby'] },
    { text: 'Started a camera class. Relearning the basics.', tags: ['Photography', 'Learning'] },
    { text: 'Assignments went badly and I felt down. I had been cutting sleep to work.', tags: ['Assignments', 'Slump'] },
    { text: 'A morning walk before work cleared my head.', tags: ['Exercise', 'Assignments'] },
    { text: 'Started posting my photos on social media. Reactions make me want to keep going.', tags: ['Social media', 'Sharing'] },
    { text: 'Started sketching a plan to run my own photo class. Excited and nervous at once.', tags: ['Startup', 'Photo class'] },
    { text: 'Kept preparing late into the night and my focus dropped the next morning.', tags: ['Prep', 'Slump'] },
  ],
  zh: [
    { text: '休息日出门拍照。琢磨构图太开心，忘了时间。', tags: ['摄影', '爱好'] },
    { text: '开始上相机使用课程，从基础重新学起。', tags: ['摄影', '学习'] },
    { text: '课题进展不顺，情绪低落。一直在压缩睡眠赶工。', tags: ['课题', '低谷'] },
    { text: '早上散步后再开始干活，头脑清爽了很多。', tags: ['运动', '课题'] },
    { text: '开始在社交平台发布自己拍的照片。收到反馈就更想坚持。', tags: ['社交平台', '分享'] },
    { text: '开始构思自己开一个摄影课。既兴奋又不安。', tags: ['创业', '摄影课'] },
    { text: '准备工作忙到深夜，第二天早上注意力明显下降。', tags: ['准备', '低谷'] },
  ],
  ko: [
    { text: '쉬는 날 사진을 찍으러 나갔다. 구도를 고민하는 게 즐거워서 시간 가는 줄 몰랐다.', tags: ['사진', '취미'] },
    { text: '카메라 강좌에 다니기 시작했다. 기초부터 다시 배우는 중.', tags: ['사진', '배움'] },
    { text: '과제가 잘 안 풀려서 우울했다. 잠을 줄여 가며 작업하고 있었다.', tags: ['과제', '부진'] },
    { text: '아침에 산책하고 나서 작업했더니 머리가 맑아졌다.', tags: ['운동', '과제'] },
    { text: 'SNS에 찍은 사진을 올리기 시작했다. 반응이 오면 계속하고 싶어진다.', tags: ['SNS', '공유'] },
    { text: '직접 사진 교실을 열어 보는 구상을 시작했다. 설레면서도 불안하다.', tags: ['창업', '사진 교실'] },
    { text: '밤늦게까지 준비하다가 다음 날 아침 집중력이 떨어졌다.', tags: ['준비', '부진'] },
  ],
  fr: [
    { text: 'Sorti faire des photos pendant mon jour de repos. À jouer avec la composition, je n’ai pas vu le temps passer.', tags: ['Photo', 'Loisir'] },
    { text: 'Commencé un cours de photo. Je reprends les bases.', tags: ['Photo', 'Apprentissage'] },
    { text: 'Les devoirs n’avançaient pas, coup de mou. Je rognais sur le sommeil pour travailler.', tags: ['Devoirs', 'Baisse'] },
    { text: 'Une marche le matin avant de travailler, et les idées étaient claires.', tags: ['Sport', 'Devoirs'] },
    { text: 'Commencé à publier mes photos sur les réseaux. Les réactions donnent envie de continuer.', tags: ['Réseaux', 'Partage'] },
    { text: 'Je commence à imaginer mon propre cours photo. Excitant et angoissant à la fois.', tags: ['Projet', 'Cours photo'] },
    { text: 'Préparatifs jusqu’à tard dans la nuit ; concentration en berne le lendemain matin.', tags: ['Préparatifs', 'Baisse'] },
  ],
  pt: [
    { text: 'Saí pra fotografar na folga. Me diverti tanto pensando na composição que perdi a hora.', tags: ['Fotografia', 'Hobby'] },
    { text: 'Comecei um curso de câmera. Reaprendendo do básico.', tags: ['Fotografia', 'Aprendizado'] },
    { text: 'As tarefas não andavam e fiquei pra baixo. Estava cortando sono pra trabalhar.', tags: ['Tarefas', 'Baixa'] },
    { text: 'Caminhei de manhã antes de trabalhar e a cabeça clareou.', tags: ['Exercício', 'Tarefas'] },
    { text: 'Comecei a postar minhas fotos nas redes. As reações dão vontade de continuar.', tags: ['Redes', 'Divulgação'] },
    { text: 'Comecei a planejar abrir meu próprio curso de foto. Empolgante e assustador ao mesmo tempo.', tags: ['Empreender', 'Curso de foto'] },
    { text: 'Fiquei preparando tudo até tarde e a concentração caiu na manhã seguinte.', tags: ['Preparação', 'Baixa'] },
  ],
};

// 指定言語のサンプル日記一覧を生成する
export function sampleJournalFor(language: Language): JournalEntry[] {
  const texts = JOURNAL_TEXTS[language] ?? JOURNAL_TEXTS.ja;
  return JOURNAL_SKELETON.map((s, i) => ({
    id: s.id,
    date: s.date,
    mood: s.mood,
    sleepHours: s.sleepHours,
    text: texts[i].text,
    tags: texts[i].tags,
    sample: true,
  }));
}

// 表示言語の変更にサンプル日記だけ追従させる
export function refreshSampleJournal(entries: JournalEntry[], language: Language): JournalEntry[] {
  const templates = sampleJournalFor(language);
  return entries.map((e) => (e.sample ? (templates.find((t) => t.id === e.id) ?? e) : e));
}

// 旧バージョンで保存されたシードの移行（idと本文が日本語サンプルに一致するものだけ）
export function markLegacySampleJournal(entries: JournalEntry[]): JournalEntry[] {
  return entries.map((e) => {
    const idx = JOURNAL_SKELETON.findIndex((s) => s.id === e.id);
    if (idx >= 0 && !e.sample && e.text === JOURNAL_TEXTS.ja[idx].text) return { ...e, sample: true };
    return e;
  });
}
