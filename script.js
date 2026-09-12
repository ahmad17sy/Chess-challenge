const board = document.getElementById("chessboard");
const lightColor = document.getElementById("lightColor");
const darkColor = document.getElementById("darkColor");

function updateBoardColors() {

    if (!lightColor || !darkColor) {
        return;
    }

    document.querySelectorAll(".light").forEach(function(square) {
        square.style.backgroundColor = lightColor.value;
    });

    document.querySelectorAll(".dark").forEach(function(square) {
        square.style.backgroundColor = darkColor.value;
    });
}

if (lightColor) {
    lightColor.addEventListener("input", updateBoardColors);
}

if (darkColor) {
    darkColor.addEventListener("input", updateBoardColors);
}
// ===============================
// الوضع الابتدائي
// ===============================

const startingPosition = [
    "bR","bN","bB","bQ","bK","bB","bN","bR",
    "bP","bP","bP","bP","bP","bP","bP","bP",
    "","","","","","","","",
    "","","","","","","","",
    "","","","","","","","",
    "","","","","","","","",
    "wP","wP","wP","wP","wP","wP","wP","wP",
    "wR","wN","wB","wQ","wK","wB","wN","wR"
];

let pieces = [...startingPosition];


let currentTurn = "w";
let selectedSquare = null;
let draggedSquare = null;
let playerColor = "w";
let computerRating = 2000;
let stockfish = new Worker("stockfish-18-lite-single.js");

stockfish.onmessage = function(event) {
    console.log("Stockfish:", event.data);
};

stockfish.postMessage("uci");

let history = [];

let castlingRights = {
    wK: true,
    wQ: true,
    bK: true,
    bQ: true
};

let enPassantSquare = null;

// ===============================
// الأدوات الأساسية
// ===============================

function getColor(piece) {
    return piece ? piece[0] : null;
}

function getType(piece) {
    return piece ? piece[1] : null;
}

function getPosition(index) {
    return {
        row: Math.floor(index / 8),
        col: index % 8
    };
}

function getIndex(row, col) {
    return row * 8 + col;
}

function isInside(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

// ===============================
// إيجاد الملك
// ===============================

function findKing(color, position = pieces) {

    for (let i = 0; i < 64; i++) {

        if (position[i] === color + "K") {
            return i;
        }
    }

    return -1;
}

// ===============================
// هل مربع معين مهدد؟
// ===============================

function isSquareAttacked(square, byColor, position = pieces) {

    const target = getPosition(square);

    for (let i = 0; i < 64; i++) {

        const piece = position[i];

        if (!piece || getColor(piece) !== byColor) {
            continue;
        }

        const start = getPosition(i);

        const rowDiff = target.row - start.row;
        const colDiff = target.col - start.col;

        const absRow = Math.abs(rowDiff);
        const absCol = Math.abs(colDiff);

        const type = getType(piece);

        // البيدق
        if (type === "P") {

            const direction = byColor === "w" ? -1 : 1;

            if (
                rowDiff === direction &&
                absCol === 1
            ) {
                return true;
            }
        }

        // الحصان
        if (type === "N") {

            if (
                (absRow === 2 && absCol === 1) ||
                (absRow === 1 && absCol === 2)
            ) {
                return true;
            }
        }

        // الملك
        if (type === "K") {

            if (absRow <= 1 && absCol <= 1) {
                return true;
            }
        }

        // الفيل / الوزير
        if (type === "B" || type === "Q") {

            if (absRow === absCol && absRow !== 0) {

                const rowStep = rowDiff > 0 ? 1 : -1;
                const colStep = colDiff > 0 ? 1 : -1;

                let row = start.row + rowStep;
                let col = start.col + colStep;

                let clear = true;

                while (row !== target.row || col !== target.col) {

                    if (position[getIndex(row, col)]) {
                        clear = false;
                        break;
                    }

                    row += rowStep;
                    col += colStep;
                }

                if (clear) {
                    return true;
                }
            }
        }

        // الرخ / الوزير
        if (type === "R" || type === "Q") {

            if (
                (rowDiff === 0 && colDiff !== 0) ||
                (colDiff === 0 && rowDiff !== 0)
            ) {

                const rowStep =
                    rowDiff === 0 ? 0 : rowDiff > 0 ? 1 : -1;

                const colStep =
                    colDiff === 0 ? 0 : colDiff > 0 ? 1 : -1;

                let row = start.row + rowStep;
                let col = start.col + colStep;

                let clear = true;

                while (row !== target.row || col !== target.col) {

                    if (position[getIndex(row, col)]) {
                        clear = false;
                        break;
                    }

                    row += rowStep;
                    col += colStep;
                }

                if (clear) {
                    return true;
                }
            }
        }
    }

    return false;
}

// ===============================
// هل الملك في كش؟
// ===============================

function isInCheck(color, position = pieces) {

    const king = findKing(color, position);

    if (king === -1) {
        return true;
    }

    const enemy = color === "w" ? "b" : "w";

    return isSquareAttacked(king, enemy, position);
}

// ===============================
// حركة القطعة بدون التحقق من الملك
// ===============================

function isPseudoLegalMove(from, to, position = pieces) {

    if (from === to) {
        return false;
    }

    const piece = position[from];
    const target = position[to];

    if (!piece) {
        return false;
    }

    if (target && getColor(target) === getColor(piece)) {
        return false;
    }

    const color = getColor(piece);
    const type = getType(piece);

    const start = getPosition(from);
    const end = getPosition(to);

    const rowDiff = end.row - start.row;
    const colDiff = end.col - start.col;

    const absRow = Math.abs(rowDiff);
    const absCol = Math.abs(colDiff);

    // =========================
    // Pawn
    // =========================

    if (type === "P") {

        const direction = color === "w" ? -1 : 1;
        const startRow = color === "w" ? 6 : 1;

        // خطوة واحدة
        if (
            colDiff === 0 &&
            rowDiff === direction &&
            !target
        ) {
            return true;
        }

        // خطوتان
        if (
            colDiff === 0 &&
            rowDiff === direction * 2 &&
            start.row === startRow &&
            !target
        ) {

            const middle = getIndex(
                start.row + direction,
                start.col
            );

            if (!position[middle]) {
                return true;
            }
        }

        // أخذ قطعة
        if (
            absCol === 1 &&
            rowDiff === direction &&
            target &&
            getColor(target) !== color
        ) {
            return true;
        }

        // En Passant
        if (
            absCol === 1 &&
            rowDiff === direction &&
            to === enPassantSquare
        ) {
            return true;
        }

        return false;
    }

    // =========================
    // Knight
    // =========================

    if (type === "N") {

        return (
            (absRow === 2 && absCol === 1) ||
            (absRow === 1 && absCol === 2)
        );
    }

    // =========================
    // King
    // =========================

    if (type === "K") {

        // الحركة العادية
        if (absRow <= 1 && absCol <= 1) {
            return true;
        }

        // التبييت
        if (rowDiff === 0 && absCol === 2) {

            if (color === "w" && from === 60) {

                // تبييت قصير
                if (
                    to === 62 &&
                    castlingRights.wK &&
                    position[61] === "" &&
                    position[62] === "" &&
                    position[63] === "wR"
                ) {
                    return true;
                }

                // تبييت طويل
                if (
                    to === 58 &&
                    castlingRights.wQ &&
                    position[59] === "" &&
                    position[58] === "" &&
                    position[57] === "" &&
                    position[56] === "wR"
                ) {
                    return true;
                }
            }

            if (color === "b" && from === 4) {

                // تبييت قصير
                if (
                    to === 6 &&
                    castlingRights.bK &&
                    position[5] === "" &&
                    position[6] === "" &&
                    position[7] === "bR"
                ) {
                    return true;
                }

                // تبييت طويل
                if (
                    to === 2 &&
                    castlingRights.bQ &&
                    position[3] === "" &&
                    position[2] === "" &&
                    position[1] === "" &&
                    position[0] === "bR"
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    // =========================
    // Bishop / Rook / Queen
    // =========================

    if (
        type === "B" ||
        type === "R" ||
        type === "Q"
    ) {

        let validDirection = false;

        if (type === "B") {
            validDirection = absRow === absCol && absRow !== 0;
        }

        if (type === "R") {
            validDirection =
                (rowDiff === 0 && colDiff !== 0) ||
                (colDiff === 0 && rowDiff !== 0);
        }

        if (type === "Q") {
            validDirection =
                absRow === absCol && absRow !== 0 ||
                (rowDiff === 0 && colDiff !== 0) ||
                (colDiff === 0 && rowDiff !== 0);
        }

        if (!validDirection) {
            return false;
        }

        const rowStep =
            rowDiff === 0 ? 0 : rowDiff > 0 ? 1 : -1;

        const colStep =
            colDiff === 0 ? 0 : colDiff > 0 ? 1 : -1;

        let row = start.row + rowStep;
        let col = start.col + colStep;

        while (row !== end.row || col !== end.col) {

            if (position[getIndex(row, col)]) {
                return false;
            }

            row += rowStep;
            col += colStep;
        }

        return true;
    }

    return false;
}

// ===============================
// تنفيذ حركة مؤقتة
// ===============================

function simulateMove(from, to, position) {

    const newPosition = [...position];

    const piece = newPosition[from];
    const color = getColor(piece);
    const type = getType(piece);

    // En Passant
    if (
        type === "P" &&
        to === enPassantSquare &&
        !newPosition[to]
    ) {

        const direction = color === "w" ? 1 : -1;

        const capturedPawn = to + direction * 8;

        newPosition[capturedPawn] = "";
    }

    newPosition[to] = piece;
    newPosition[from] = "";

    // تبييت
    if (type === "K" && Math.abs(to - from) === 2) {

        if (to > from) {

            newPosition[from + 3] = "";
            newPosition[from + 1] = color + "R";

        } else {

            newPosition[from - 4] = "";
            newPosition[from - 1] = color + "R";
        }
    }

    return newPosition;
}

// ===============================
// هل الحركة قانونية فعلاً؟
// ===============================

function isLegalMove(from, to) {

    const piece = pieces[from];

    if (!piece) {
        return false;
    }

    if (getColor(piece) !== currentTurn) {
        return false;
    }

    if (!isPseudoLegalMove(from, to, pieces)) {
        return false;
    }

    // التبييت يحتاج التأكد من أن الملك
    // لا يمر عبر كش

    if (
        getType(piece) === "K" &&
        Math.abs(to - from) === 2
    ) {

        if (isInCheck(currentTurn)) {
            return false;
        }

        const direction = to > from ? 1 : -1;

        const middleSquare = from + direction;

        const middlePosition =
            simulateMove(from, middleSquare, pieces);

        const enemy =
            currentTurn === "w" ? "b" : "w";

        if (
            isSquareAttacked(
                middleSquare,
                enemy,
                middlePosition
            )
        ) {
            return false;
        }
    }

    const newPosition =
        simulateMove(from, to, pieces);

    return !isInCheck(currentTurn, newPosition);
}

// ===============================
// تحديث حقوق التبييت
// ===============================

function updateCastlingRights(from, to, piece) {

    // الملك تحرك
    if (piece === "wK") {
        castlingRights.wK = false;
        castlingRights.wQ = false;
    }

    if (piece === "bK") {
        castlingRights.bK = false;
        castlingRights.bQ = false;
    }

    // الرخ تحرك
    if (from === 63 && piece === "wR") {
        castlingRights.wK = false;
    }

    if (from === 56 && piece === "wR") {
        castlingRights.wQ = false;
    }

    if (from === 7 && piece === "bR") {
        castlingRights.bK = false;
    }

    if (from === 0 && piece === "bR") {
        castlingRights.bQ = false;
    }

    // أخذ رخ
    if (to === 63) {
        castlingRights.wK = false;
    }

    if (to === 56) {
        castlingRights.wQ = false;
    }

    if (to === 7) {
        castlingRights.bK = false;
    }

    if (to === 0) {
        castlingRights.bQ = false;
    }
}

// ===============================
// تنفيذ الحركة
// ===============================

function makeMove(from, to) {

    if (!isLegalMove(from, to)) {
        return false;
    }

    // حفظ الحالة للـ Undo
    history.push({
        pieces: [...pieces],
        currentTurn: currentTurn,
        castlingRights: {...castlingRights},
        enPassantSquare: enPassantSquare
    });

    const piece = pieces[from];
    const color = getColor(piece);
    const type = getType(piece);

    const oldEnPassant = enPassantSquare;

    // En Passant
    if (
        type === "P" &&
        to === oldEnPassant &&
        !pieces[to]
    ) {

        const direction = color === "w" ? 1 : -1;

        pieces[to + direction * 8] = "";
    }

    // تحديث حقوق التبييت
    updateCastlingRights(from, to, piece);

    // تنفيذ الحركة
    pieces[to] = pieces[from];
    pieces[from] = "";

    // التبييت وتحريك الرخ
    if (type === "K" && Math.abs(to - from) === 2) {

        if (to > from) {

            pieces[from + 1] = pieces[from + 3];
            pieces[from + 3] = "";

        } else {

            pieces[from - 1] = pieces[from - 4];
            pieces[from - 4] = "";
        }
    }

    // En Passant جديد
    enPassantSquare = null;

    if (
        type === "P" &&
        Math.abs(to - from) === 16
    ) {

        enPassantSquare =
            (from + to) / 2;
    }

    // ترقية
    if (
        type === "P" &&
        (Math.floor(to / 8) === 0 ||
         Math.floor(to / 8) === 7)
    ) {

        promotePawn(to);
    }

    currentTurn =
        currentTurn === "w" ? "b" : "w";

    selectedSquare = null;

    createBoard();

updateGameStatus();
// تشغيل الكمبيوتر
if (currentTurn !== playerColor) {
    computerMove();
}

return true;
}

// ===============================
// ترقية البيدق
// ===============================

function promotePawn(square) {

    const color = getColor(pieces[square]);

    let choice = prompt(
        "ترقية البيدق:\n\n" +
        "Q = وزير\n" +
        "R = رخ\n" +
        "B = فيل\n" +
        "N = حصان",
        "Q"
    );

    choice = choice ? choice.toUpperCase() : "Q";

    if (!["Q","R","B","N"].includes(choice)) {
        choice = "Q";
    }

    pieces[square] = color + choice;
}

// ===============================
// معرفة الحركات القانونية
// ===============================

function getLegalMoves(color) {

    const moves = [];

    for (let from = 0; from < 64; from++) {

        if (!pieces[from]) {
            continue;
        }

        if (getColor(pieces[from]) !== color) {
            continue;
        }

        for (let to = 0; to < 64; to++) {

            if (isLegalMoveForColor(from, to, color)) {
                moves.push({
                    from: from,
                    to: to
                });
            }
        }
    }

    return moves;
}

// نسخة خاصة بفحص الطرف الآخر
function isLegalMoveForColor(from, to, color) {

    const oldTurn = currentTurn;

    currentTurn = color;

    const result = isLegalMove(from, to);

    currentTurn = oldTurn;

    return result;
}

// ===============================
// حالة اللعبة
// ===============================

function updateGameStatus() {

    const status =
        document.getElementById("gameStatus");

    if (!status) {
        return;
    }

    const legalMoves =
        getLegalMoves(currentTurn);

    if (legalMoves.length === 0) {

        if (isInCheck(currentTurn)) {

            const winner =
                currentTurn === "w"
                    ? "الأسود"
                    : "الأبيض";

            status.textContent =
                "♚ كش مات! الفائز: " + winner;

        } else {

            status.textContent =
                "🤝 تعادل — Stalemate";
        }

        return;
    }

    if (isInCheck(currentTurn)) {

        status.textContent =
            "⚠️ كش على " +
            (currentTurn === "w"
                ? "الأبيض"
                : "الأسود");

    } else {

        status.textContent =
            "دور " +
            (currentTurn === "w"
                ? "الأبيض"
                : "الأسود");
    }
}

// ===============================
// التراجع Undo
// ===============================

function undoMove() {

    if (history.length === 0) {
        return;
    }

    const previous =
        history.pop();

    pieces = [...previous.pieces];

    currentTurn =
        previous.currentTurn;

    castlingRights =
        {...previous.castlingRights};

    enPassantSquare =
        previous.enPassantSquare;

    selectedSquare = null;

    createBoard();

    updateGameStatus();
}

// ===============================
// لعبة جديدة
// ===============================
// ===============================
// حركة الكمبيوتر
// ===============================
function newGame() {

    pieces = [...startingPosition];

    currentTurn = "w";

    selectedSquare = null;

    draggedSquare = null;

    history = [];

    castlingRights = {
        wK: true,
        wQ: true,
        bK: true,
        bQ: true
    };

    enPassantSquare = null;

    createBoard();

    updateGameStatus();

    if (currentTurn !== playerColor) {
        computerMove();
    }
}

// ===============================
// الحركة بالنقر
// ===============================

function clickMove(index) {

    // لا يوجد مربع مختار
    if (selectedSquare === null) {

        if (
            pieces[index] &&
            getColor(pieces[index]) === currentTurn
        ) {

            selectedSquare = index;

            createBoard();

            document
                .querySelectorAll(".square")[index]
                .classList.add("selected");
        }

        return;
    }

    // الضغط على نفس المربع
    if (selectedSquare === index) {

        selectedSquare = null;

        createBoard();

        return;
    }

    // محاولة الحركة
    if (makeMove(selectedSquare, index)) {
        return;
    }

    // إذا ضغط على قطعة أخرى من نفس اللون
    if (
        pieces[index] &&
        getColor(pieces[index]) === currentTurn
    ) {

        selectedSquare = index;

        createBoard();

        document
            .querySelectorAll(".square")[index]
            .classList.add("selected");

        return;
    }
}

// ===============================
// إنشاء الرقعة
// ===============================

function createBoard() {

    board.innerHTML = "";
    if (playerColor === "b") {
    board.classList.add("flipped");
} else {
    board.classList.remove("flipped");
}

    for (let i = 0; i < 64; i++) {
    console.log(i, pieces[i]);

        const square = document.createElement("div");

        square.classList.add("square");

        // ألوان الرقعة
        if (Math.floor(i / 8) % 2 === i % 2) {
            square.classList.add("light");
        } else {
            square.classList.add("dark");
        }

        // المربع المختار
        if (selectedSquare === i) {
            square.classList.add("selected");
        }

        // القطعة الموجودة في هذا المربع
        const piece = pieces[i];

        if (piece) {

            const image = document.createElement("img");

            image.src = piece + ".svg";

            image.classList.add("chess-piece");

            image.draggable = true;

            // السحب
            image.addEventListener("dragstart", function () {

                if (getColor(piece) === currentTurn) {
                    draggedSquare = i;
                } else {
                    draggedSquare = null;
                }

            });

            image.addEventListener("dragend", function () {
                draggedSquare = null;
            });

            square.appendChild(image);
        }

        // الضغط على المربع
        square.addEventListener("click", function () {
            clickMove(i);
        });

        // السماح بالسحب فوق المربع
        square.addEventListener("dragover", function (event) {
            event.preventDefault();
        });

        // إفلات القطعة
        square.addEventListener("drop", function (event) {

            event.preventDefault();

            if (draggedSquare !== null) {

                makeMove(draggedSquare, i);

                draggedSquare = null;
            }

        });

        board.appendChild(square);
    }

    // تحديث شريط التقييم
    updateEvaluationBar();

    // إعادة الألوان التي اختارها المستخدم
    updateBoardColors();
}

// ===============================
// شريط التقييم
// ===============================

function calculateMaterial() {

    const values = {
        P: 1,
        N: 3,
        B: 3,
        R: 5,
        Q: 9,
        K: 0
    };

    let score = 0;

    for (const piece of pieces) {

        if (!piece) {
            continue;
        }

        const value =
            values[getType(piece)];

        if (getColor(piece) === "w") {
            score += value;
        } else {
            score -= value;
        }
    }

    return score;
}

function updateEvaluationBar() {

    let bar =
        document.getElementById(
            "evaluationBar"
        );

    if (!bar) {
        return;
    }

    const score =
        calculateMaterial();

    // قيمة تقريبية مؤقتة
    // سنستبدلها بـ Stockfish لاحقاً

    const limited =
        Math.max(-10, Math.min(10, score));

    const whitePercent =
        50 + limited * 5;

    bar.style.setProperty(
        "--white-percent",
        whitePercent + "%"
    );

    const number =
        document.getElementById(
            "evaluationNumber"
        );

    if (number) {

        if (score > 0) {
            number.textContent =
                "+" + score.toFixed(1);
        } else {
            number.textContent =
                score.toFixed(1);
        }
    }
}

// ===============================
// أزرار New Game و Undo
// ===============================

function createControls() {

    let controls =
        document.getElementById(
            "chessControls"
        );

    if (controls) {
        return;
    }

    controls =
        document.createElement("div");

    controls.id =
        "chessControls";

    controls.innerHTML = `
        <button id="newGameButton">
            🔄 New Game
        </button>

        <button id="undoButton">
            ↩ Undo
        </button>

        <label id="computerRatingLabel">
            Computer:
            <select id="computerRating">
                <option value="1500">1500</option>
                <option value="1600">1600</option>
                <option value="1700">1700</option>
                <option value="1800">1800</option>
                <option value="1900">1900</option>
                <option value="2000" selected>2000</option>
                <option value="2100">2100</option>
                <option value="2200">2200</option>
                <option value="2300">2300</option>
                <option value="2400">2400</option>
            </select>
        </label>
    `;

    board.parentNode.insertBefore(
        controls,
        board
    );

    document
        .getElementById("newGameButton")
        .addEventListener(
            "click",
            newGame
        );

    document
        .getElementById("undoButton")
        .addEventListener(
            "click",
            undoMove
        );

    document
        .getElementById("computerRating")
        .addEventListener(
            "change",
            function () {

                computerRating =
                    parseInt(this.value);

            }
        );
}

// ===============================
// إنشاء شريط التقييم
// ===============================

function createEvaluationBar() {

    if (
        document.getElementById(
            "evaluationBar"
        )
    ) {
        return;
    }

    const wrapper =
        document.createElement("div");

    wrapper.id =
        "evaluationWrapper";

    wrapper.innerHTML = `
        <div id="evaluationBar">
            <div id="evaluationNumber">
                0.0
            </div>
        </div>
    `;

    board.parentNode.insertBefore(
        wrapper,
        board
    );

    // ننقل الرقعة والشريط إلى حاوية واحدة
    const gameArea =
        document.createElement("div");

    gameArea.id =
        "chessGameArea";

    board.parentNode.insertBefore(
        gameArea,
        board
    );

    gameArea.appendChild(wrapper);
    gameArea.appendChild(board);
}

// ===============================
// تشغيل اللعبة
// ===============================

createControls();

createEvaluationBar();

createBoard();

document
    .getElementById("whiteButton")
    .addEventListener("click", function () {
        playerColor = "w";
        newGame();
    });

document
    .getElementById("blackButton")
    .addEventListener("click", function () {
        playerColor = "b";
        newGame();
    });

// ===============================
// تحديث اللعبة عند التشغيل
// ===============================

updateGameStatus();
// ===============================
// الكمبيوتر
// ===============================

function computerMove() {

    // إذا كان الدور ليس للكمبيوتر
    if (currentTurn === playerColor) {
        return;
    }

    // الحصول على جميع الحركات القانونية
    const moves = getLegalMoves(currentTurn);

    // لا توجد حركات
    if (moves.length === 0) {
        updateGameStatus();
        return;
    }

    // اختيار حركة عشوائية مؤقتاً
    const randomMove =
        moves[Math.floor(Math.random() * moves.length)];

    // تأخير بسيط حتى يبدو أن الكمبيوتر يفكر
    setTimeout(function () {

        makeMove(
            randomMove.from,
            randomMove.to
        );

    }, 500);
}