const { Chess } = require("chess.js");

const express = require("express");
const cors = require("cors");

const app = express();

const PORT = 3000;

app.use(cors());
app.use(express.json());


// ========================================
// TEST ROUTE
// ========================================

app.get("/", (req, res) => {

    res.send("My Chess Server is running!");

});


// ========================================
// SERVE WEBSITE FILES
// ========================================

app.use(express.static(__dirname));


// ========================================
// LICHESS PLAYER
// ========================================

app.get("/api/lichess/player/:username", async (req, res) => {

    const username = req.params.username;

    try {

        const response = await fetch(
            `https://lichess.org/api/user/${encodeURIComponent(username)}`
        );

        if (!response.ok) {

            if (response.status === 404) {

                return res.status(404).json({
                    error: "Lichess player not found."
                });

            }

            return res.status(response.status).json({
                error: "Lichess API returned an error."
            });

        }

        const player = await response.json();

        return res.json({

            username: player.username,

            title: player.title || null,

            rating: player.perfs?.blitz?.rating || null,

            rapid: player.perfs?.rapid?.rating || null,

            bullet: player.perfs?.bullet?.rating || null,

            classical: player.perfs?.classical?.rating || null,

            games: player.count?.all || 0,

            ratedGames: player.count?.rated || 0,

            wins: player.count?.win || 0,

            losses: player.count?.loss || 0,

            draws: player.count?.draw || 0

        });

    } catch (error) {

        console.error(error);

        if (!res.headersSent) {

            return res.status(500).json({
                error: "Could not connect to Lichess."
            });

        }

    }

});


// ========================================
// LICHESS PLAYER GAMES
// ========================================
// ========================================
// CREATE TRAINING POSITIONS
// ========================================

function createTrainingPositions(games, username) {

    const playerName =
        username.toLowerCase();

    const trainingPositions = [];

    games.forEach(game => {

        const white =
            game.players?.white?.user?.name
                ?.toLowerCase();

        const black =
            game.players?.black?.user?.name
                ?.toLowerCase();


        // Determine whether the analyzed player lost
        let playerLost = false;
        let playerColor = null;


        if (white === playerName) {

            playerColor = "white";

            if (game.winner === "black") {
                playerLost = true;
            }

        }


        if (black === playerName) {

            playerColor = "black";

            if (game.winner === "white") {
                playerLost = true;
            }

        }


        // We only want games the player lost
        if (!playerLost) {
            return;
        }


        if (!game.moves) {
            return;
        }


        const moves =
            game.moves.trim().split(/\s+/);


        const chess =
            new Chess();


        /*
         * Look through the first 20 plies.
         * We want a position where the analyzed
         * player is about to make a move.
         */

        for (
            let ply = 0;
            ply < Math.min(moves.length, 20);
            ply++
        ) {

            const turn =
                chess.turn() === "w"
                    ? "white"
                    : "black";


            // Is it the analyzed player's turn?
            if (turn === playerColor) {

                const fen =
                    chess.fen();


                const opponentMove =
                    moves[ply];


                trainingPositions.push({

                    fen: fen,

                    move: opponentMove,

                    opening:
                        game.opening?.name ||
                        "Unknown Opening",

                    gameId:
                        game.id || null,

                    color:
                        playerColor

                });


                /*
                 * One training position per
                 * losing game for now.
                 */

                break;

            }


            try {

                chess.move(moves[ply]);

            }

            catch (error) {

                console.log(
                    "Could not replay move:",
                    moves[ply]
                );

                break;

            }

        }

    });


    return trainingPositions;

}


app.get("/api/lichess/games/:username", async (req, res) => {

    const requestedCount =
        Math.min(
            Math.max(
                parseInt(req.query.count) || 200,
                1
            ),
            500
        );

    const username =
        req.params.username;

    try {

        console.log("");
        console.log("=================================");
        console.log("Lichess games request");
        console.log("Player:", username);
        console.log("Requested games:", requestedCount);
        console.log("================================="); 
        // ========================================
// DOWNLOAD REQUESTED NUMBER OF GAMES
// ========================================

        const allGames = [];

        let until = null;


        while (allGames.length < requestedCount) {
            const remaining =
            requestedCount - allGames.length;

            const batchSize =
                Math.min(300, remaining);


            let url =
                `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${batchSize}&moves=true&clocks=true&evals=false&opening=true`;


            if (until) {

                url += `&until=${until}`;

            }


            console.log("");
            console.log("Downloading Lichess games...");
            console.log("Batch size:", batchSize);


            const response = await fetch(url, {

                headers: {

                    "Accept":
                        "application/x-ndjson"

                }

            });


            // ========================================
            // API ERROR
            // ========================================

            if (!response.ok) {

                console.log(
                    "Lichess API status:",
                    response.status
                );


                if (response.status === 404) {

                    return res.status(404).json({

                        error:
                            "Lichess player not found."

                    });

                }


                return res.status(
                    response.status
                ).json({

                    error:
                        "Could not download Lichess games."

                });

            }


            // ========================================
            // READ RESPONSE
            // ========================================

            const text =
                await response.text();


            // ========================================
            // PARSE NDJSON
            // ========================================

            const batchGames =
                text
                    .split("\n")

                    .filter(
                        line =>
                            line.trim() !== ""
                    )

                    .map(line => {

                        try {

                            return JSON.parse(line);

                        }

                        catch (error) {

                            console.error(
                                "Could not parse game:",
                                error
                            );

                            return null;

                        }

                    })

                    .filter(
                        game =>
                            game !== null
                    );


            console.log(
                "Games received in this batch:",
                batchGames.length
            );


            // ========================================
            // NO MORE GAMES
            // ========================================

            if (
                batchGames.length === 0
            ) {

                break;

            }


            // ========================================
            // ADD GAMES
            // ========================================

            allGames.push(
                ...batchGames
            );


            // ========================================
            // FIND OLDEST GAME
            // ========================================

            const oldestGame =
                batchGames[
                    batchGames.length - 1
                ];


            if (
                !oldestGame.createdAt
            ) {

                break;

            }


            until =
                oldestGame.createdAt - 1;


            // ========================================
            // LAST BATCH
            // ========================================

            if (
                batchGames.length < batchSize
            ) {

                break;

            }

        }


        // ========================================
// KEEP ONLY REQUESTED NUMBER
// ========================================

        const games =
    allGames.slice(0, requestedCount);


        console.log("");
        console.log("==============================");
        console.log(
            "TOTAL GAMES:",
            games.length
        );
        console.log("==============================");


        // ========================================
        // CALCULATE OPENING STATISTICS
        // ========================================

        const openingCounts = {};


        games.forEach(game => {

            const openingName =
                game.opening?.name;


            if (!openingName) {

                return;

            }


            if (
                !openingCounts[openingName]
            ) {

                openingCounts[openingName] = 0;

            }


            openingCounts[openingName]++;

        });


        const openings =
            Object.entries(
                openingCounts
            )

                .sort(
                    (a, b) =>
                        b[1] - a[1]
                )

                .map(
                    ([name, count]) => ({

                        name: name,

                        count: count

                    })
                );


        // ========================================
        // OPPONENT PREPARATION
        // ========================================

        const againstE4 = {};

        const againstD4 = {};


        // ========================================
        // ANALYZE BLACK'S RESPONSES
        // ========================================

        games.forEach(game => {

            const white =
                game.players?.white?.user?.name
                    ?.toLowerCase();


            const black =
                game.players?.black?.user?.name
                    ?.toLowerCase();


            const moves =
                game.moves
                    ? game.moves.split(" ")
                    : [];


            // Only analyze games
            // where player was Black.

            if (
                black !==
                username.toLowerCase()
            ) {

                return;

            }


            if (
                moves.length < 2
            ) {

                return;

            }


            const firstMove =
                moves[0];


            const blackResponse =
                moves[1];


            // ========================================
            // AGAINST 1.e4
            // ========================================

            if (
                firstMove === "e4"
            ) {

                if (
                    !againstE4[blackResponse]
                ) {

                    againstE4[blackResponse] = {

                        games: 0,

                        wins: 0,

                        losses: 0,

                        draws: 0

                    };

                }


                againstE4[
                    blackResponse
                ].games++;


                if (!game.winner) {

                    againstE4[
                        blackResponse
                    ].draws++;

                }

                else if (
                    game.winner === "black"
                ) {

                    againstE4[
                        blackResponse
                    ].wins++;

                }

                else {

                    againstE4[
                        blackResponse
                    ].losses++;

                }

            }


            // ========================================
            // AGAINST 1.d4
            // ========================================

            if (
                firstMove === "d4"
            ) {

                if (
                    !againstD4[blackResponse]
                ) {

                    againstD4[blackResponse] = {

                        games: 0,

                        wins: 0,

                        losses: 0,

                        draws: 0

                    };

                }


                againstD4[
                    blackResponse
                ].games++;


                if (!game.winner) {

                    againstD4[
                        blackResponse
                    ].draws++;

                }

                else if (
                    game.winner === "black"
                ) {

                    againstD4[
                        blackResponse
                    ].wins++;

                }

                else {

                    againstD4[
                        blackResponse
                    ].losses++;

                }

            }

        });


        // ========================================
        // SORT 1.e4 RESPONSES
        // ========================================

        const e4Responses =
            Object.entries(
                againstE4
            )

                .sort(
                    (a, b) =>
                        b[1].games -
                        a[1].games
                )

                .map(
                    ([move, stats]) => ({

                        move: move,

                        games: stats.games,

                        wins: stats.wins,

                        losses: stats.losses,

                        draws: stats.draws

                    })
                );


        // ========================================
        // SORT 1.d4 RESPONSES
        // ========================================

        const d4Responses =
            Object.entries(
                againstD4
            )

                .sort(
                    (a, b) =>
                        b[1].games -
                        a[1].games
                )

                .map(
                    ([move, stats]) => ({

                        move: move,

                        games: stats.games,

                        wins: stats.wins,

                        losses: stats.losses,

                        draws: stats.draws

                    })
                );


        console.log(
            "Openings found:",
            openings.length
        );


        // ========================================
        // SEND ONE RESPONSE ONLY
        // ========================================

        const trainingPositions =
    createTrainingPositions(
        games,
        username
    );


return res.json({
    username: username,
    count: games.length,
    openings: openings,
    againstE4: e4Responses,
    againstD4: d4Responses,
    trainingPositions: trainingPositions,
    games: games
});


    }

    catch (error) {

        console.error(
            "Lichess games error:",
            error
        );


        if (!res.headersSent) {

            return res.status(500).json({

                error:
                    "Could not connect to Lichess games API."

            });

        }

    }

});


// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {

    console.log("");

    console.log(
        "================================="
    );

    console.log(
        "          MY CHESS SERVER"
    );

    console.log(
        "================================="
    );

    console.log("");

    console.log(
        `Server running at http://localhost:${PORT}`
    );

    console.log("");

});