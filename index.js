import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  runTransaction,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCm_0NlWGzuzpOjY2bDreyQCcfwA-1y5Vw",
  authDomain: "festival-b86ed.firebaseapp.com",
  projectId: "festival-b86ed",
  storageBucket: "festival-b86ed.firebasestorage.app",
  messagingSenderId: "894749507915",
  appId: "1:894749507915:web:ec6cad2bc47131358d68ce",
  measurementId: "G-SS7Y58CG6L"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// DOM Elements
// Firestore references for inventory
const inventoryRef = doc(db, "system", "inventory");

// Real-time stock listener
onSnapshot(inventoryRef, (snap) => {
  const stock = snap.data()?.stock ?? 0;
  updateStockUI(stock);
});
function updateStockUI(stock) {
  const stockDiv = document.getElementById('stockDisplay');
  stockDiv.textContent = `在庫: ${stock}`;
  // 色分け
  if (stock > 99) {
    stockDiv.style.color = '#4caf50'; // 緑
  } else if (stock >= 50) {
    stockDiv.style.color = '#ff9800'; // オレンジ
  } else if (stock > 0) {
    stockDiv.style.color = '#f44336'; // 赤
  } else {
    stockDiv.style.color = '#9e9e9e'; // グレー (売り切れ)
  }
  // ボタン・入力制御
  const submitBtn = document.getElementById('submit-btn');
  const quantityInput = document.getElementById('quantity');
  if (stock <= 0) {
    if (submitBtn) submitBtn.disabled = true;
    if (quantityInput) quantityInput.disabled = true;
  } else {
    if (submitBtn) submitBtn.disabled = false;
    if (quantityInput) quantityInput.disabled = false;
  }
}
const btnViewWaiting = document.getElementById("btn-view-waiting");
const tabOrder = document.getElementById("tab-order");
const tabWaiting = document.getElementById("tab-waiting");
const viewOrder = document.getElementById("view-order");
const viewWaiting = document.getElementById("view-waiting");
const orderForm = document.getElementById("order-form");
const completeScreen = document.getElementById("complete-screen");
const ticketResult = document.getElementById("ticket-result");
// Duplicate declaration removed
const waitingList = document.getElementById("waiting-list");
const loading = document.getElementById("loading");
const tabRevenueAdmin = document.getElementById("tab-revenue-admin");
const viewRevenueAdmin = document.getElementById("view-revenue-admin");
const revenueAmountSpan = document.getElementById("revenue-amount");

const nameInput = document.getElementById("name");
const locationInput = document.getElementById("location");
const quantityInput = document.getElementById("quantity");
const nameError = document.getElementById("name-error");
const quantityError = document.getElementById("quantity-error");

// ログイン画面のDOM要素
const loginScreen = document.getElementById("login-screen");
const mainApp = document.getElementById("main-app");
const visitorPasswordInput = document.getElementById("visitor-password");
const visitorPasswordError = document.getElementById("visitor-password-error");
const btnVisitorLogin = document.getElementById("btn-visitor-login");

// ログイン処理
btnVisitorLogin.addEventListener("click", async () => {
  if (visitorPasswordInput.value === "タピオカ") {
    loading.classList.remove("hidden");
    visitorPasswordError.style.display = "none";
    try {
      // 匿名ログインを実行（Firestoreルール request.auth != null を満たすため）
      await signInAnonymously(auth);
      
      loginScreen.classList.add("hidden");
      mainApp.classList.remove("hidden");
      checkAdminUI();
      // ログイン状態をセッションに保存（リロード時のため）
      sessionStorage.setItem("isVisitorLoggedIn", "true");
    } catch (authError) {
      console.error("Auth error: ", authError);
      alert("認証の接続に失敗しました。FirebaseのAuthenticationで「匿名 (Anonymous) 認証」が有効になっているかご確認ください。");
    } finally {
      loading.classList.add("hidden");
    }
  } else {
    visitorPasswordError.style.display = "block";
  }
});

// リロード時のログイン状態復元
if (sessionStorage.getItem("isVisitorLoggedIn") === "true") {
  loading.classList.remove("hidden");
  signInAnonymously(auth).then(() => {
    loginScreen.classList.add("hidden");
    mainApp.classList.remove("hidden");
    checkAdminUI();
  }).catch((error) => {
    console.error("Session restore auth error: ", error);
  }).finally(() => {
    loading.classList.add("hidden");
  });
}

// 自分の注文番号を管理
function getMyTickets() {
  const tickets = localStorage.getItem("myTapiocaTickets");
  return tickets ? JSON.parse(tickets) : [];
}

function addMyTicket(ticketNumber) {
  const tickets = getMyTickets();
  if (!tickets.includes(ticketNumber)) {
    tickets.push(ticketNumber);
    localStorage.setItem("myTapiocaTickets", JSON.stringify(tickets));
  }
}

// タブ切り替え処理
function switchTab(tabName) {
  // Hide all tabs first
  tabOrder.classList.remove("active");
  tabWaiting.classList.remove("active");
  if (tabRevenueAdmin) tabRevenueAdmin.classList.remove("active");

  viewOrder.classList.add("hidden");
  viewWaiting.classList.add("hidden");
  if (viewRevenueAdmin) viewRevenueAdmin.classList.add("hidden");

  if (tabName === "order") {
    tabOrder.classList.add("active");
    viewOrder.classList.remove("hidden");
  } else if (tabName === "waiting") {
    tabWaiting.classList.add("active");
    viewWaiting.classList.remove("hidden");
  } else if (tabName === "revenue-admin") {
    if (tabRevenueAdmin) tabRevenueAdmin.classList.add("active");
    if (viewRevenueAdmin) viewRevenueAdmin.classList.remove("hidden");
  }
}



tabOrder.addEventListener("click", () => switchTab("order"));
if (tabRevenueAdmin) {
  tabRevenueAdmin.addEventListener("click", () => {
    switchTab("revenue-admin");
    loadRevenue();
  });
}

tabWaiting.addEventListener("click", () => switchTab("waiting"));

// 注文処理

// Admin UI helper
function checkAdminUI() {
  const uid = auth.currentUser ? auth.currentUser.uid : null;
  const adminUid = "3Vpu2wLuaKgGv6vwJCQU50KO5fE3";
  if (tabRevenueAdmin) {
    if (uid === adminUid) {
      tabRevenueAdmin.classList.remove("hidden");
    } else {
      tabRevenueAdmin.classList.add("hidden");
    }
  }
}

async function loadRevenue() {
  if (!revenueAmountSpan) return;
  revenueAmountSpan.textContent = "計算中...";
  try {
    const snapshot = await getDocs(collection(db, "orders"));
    let total = 0;
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data && typeof data.quantity === "number") {
        total += data.quantity * 200;
      }
    });
    revenueAmountSpan.textContent = total;
  } catch (e) {
    console.error("Error loading revenue:", e);
    revenueAmountSpan.textContent = "エラー";
  }
}
orderForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const name = nameInput.value.trim();
  const location = locationInput.value;
  const quantity = parseInt(quantityInput.value, 10);
  
  let hasError = false;
  if (!name) {
    nameError.style.display = "block";
    hasError = true;
  } else {
    nameError.style.display = "none";
  }
  
  if (isNaN(quantity) || quantity < 1 || quantity > 4) {
    quantityError.style.display = "block";
    hasError = true;
  } else {
    quantityError.style.display = "none";
  }
  
  if (hasError) return;

  loading.classList.remove("hidden");

  try {
    const ordersRef = collection(db, "orders");
    
    // タイムアウト用ヘルパー関数（10秒）
    const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("サーバー通信がタイムアウトしました。通信環境やFirebaseの設定をご確認ください。")), ms));

    // トランザクションによる安全な連番採番と注文登録
    const nextTicket = await Promise.race([
      runTransaction(db, async (transaction) => {
        const counterRef = doc(db, "counters", "orders");
        const counterDoc = await transaction.get(counterRef);
        const inventoryRef = doc(db, "system", "inventory");
        const inventoryDoc = await transaction.get(inventoryRef);

        // Ensure inventory document exists with initial stock if missing
        if (!inventoryDoc.exists()) {
          transaction.set(inventoryRef, { stock: 200 }, { merge: true });
        }

        let currentTicket = 0;
        if (counterDoc.exists()) {
          const data = counterDoc.data();
          if (data && typeof data.lastTicketNumber === "number" && !isNaN(data.lastTicketNumber)) {
            currentTicket = data.lastTicketNumber;
          }
        }

        // 在庫確認
        const currentStock = (inventoryDoc.data()?.stock ?? 0);
        if (currentStock < quantity) {
          throw new Error("在庫不足のため注文できません。");
        }

        let ticketVal = currentTicket + 1;
        if (ticketVal > 999 || ticketVal < 1 || isNaN(ticketVal)) {
          ticketVal = 1;
        }

        // カウンター更新
        transaction.set(counterRef, { lastTicketNumber: ticketVal }, { merge: true });

        // 在庫減少
        transaction.update(inventoryRef, { stock: currentStock - quantity });

        // 新しい注文ドキュメントの作成
        const newOrderRef = doc(collection(db, "orders"));
        transaction.set(newOrderRef, {
          ticketNumber: ticketVal,
          name,
          quantity,
          location,
          delivered: false,
          createdAt: serverTimestamp()
        });

        return ticketVal;
      }),
      timeout(10000)
    ]);
    
    // 注文完了表示
    const paddedTicket = String(nextTicket).padStart(3, "0");
    ticketResult.textContent = paddedTicket;

    // 案内テキストの切り替え
    const pickupInstruction = document.getElementById("pickup-instruction");
    if (pickupInstruction) {
      if (location === "店舗受け取り") {
        pickupInstruction.textContent = "【販売所にて整理券番号と名前(ニックネーム)を教えてください】";
      } else {
        pickupInstruction.textContent = "【販売員がお届けに参り、整理券番号と名前(ニックネーム)をお呼びするので速やかにお受け取り下さい】";
      }
    }
    
    // 自分の注文番号としてローカルストレージに保存
    addMyTicket(nextTicket);
    
    orderForm.classList.add("hidden");
    completeScreen.style.display = "block";
    
    // フォームリセット
    orderForm.reset();
    nameInput.value = "";
    quantityInput.value = "1";
    
  } catch (error) {
    console.error("Error adding document: ", error);
    alert("注文に失敗しました。エラー詳細: " + error.message);
  } finally {
    loading.classList.add("hidden");
  }
});

// 次の注文へ
  btnViewWaiting.addEventListener("click", () => {
    // 待ち一覧へ遷移
    switchTab("waiting");
  });

  const btnOrderAgain = document.getElementById("btn-order-again");
  if (btnOrderAgain) {
    btnOrderAgain.addEventListener("click", () => {
      // 完了画面を隠し、フォームを再表示して注文タブを表示
      completeScreen.style.display = "none";
      orderForm.classList.remove("hidden");
      switchTab("order");
    });
  }

// 待ち一覧のリアルタイム同期
const waitingQuery = query(
  collection(db, "orders"),
  where("delivered", "==", false)
);

onSnapshot(waitingQuery, (snapshot) => {
  waitingList.innerHTML = "";
  
  if (snapshot.empty) {
    waitingList.innerHTML = "<p style='text-align:center;color:#888;font-size:1.5rem;padding:20px;'>現在待ちのお客様はいません。</p>";
    return;
  }
  
  let orders = [];
  snapshot.forEach((doc) => {
    orders.push(doc.data());
  });
  
  // クライアント側でソート (昇順)
  orders.sort((a, b) => a.ticketNumber - b.ticketNumber);

  const myTickets = getMyTickets();

  orders.forEach((data) => {
    const ticketNumStr = String(data.ticketNumber).padStart(3, "0");
    
    const div = document.createElement("div");
    div.className = "waiting-item";
    
    if (myTickets.includes(data.ticketNumber)) {
      div.classList.add("my-ticket");
      div.innerHTML = `${ticketNumStr} <span class="my-ticket-label">← あなたの注文番号</span>`;
    } else {
      div.textContent = ticketNumStr;
    }
    
    waitingList.appendChild(div);
  });
});

// 背景スライドショーの制御 (15秒ごとにフェード切り替え)
function initBgSlideshow() {
  const slides = document.querySelectorAll(".bg-slide");
  if (slides.length === 0) return;

  let currentSlide = 0;

  setInterval(() => {
    slides[currentSlide].classList.remove("active");
    currentSlide = (currentSlide + 1) % slides.length;
    slides[currentSlide].classList.add("active");
  }, 5000); // 5秒周期
}

initBgSlideshow();
