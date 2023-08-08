const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const http = require('http')
const {Server} = require('socket.io')

//set socket.io
const server = http.createServer(app)
const io = new Server(server , {
    cors:{
        origin:"http://localhost:3000",
        credentials:true,
    }
})

//middlewares
app.disable('X-Powered-By')
app.use(express.static('public'))
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(cors({
    credentials:true,
    origin:['http://localhost:3000'],
}))


const getAllConnectedPlayers =async ()=>{
  //to get all connected users in specific room 
  //const rooms = (await io.in().fetchSockets()).map(socket => socket.room);

  //to get all  connected users
  //const sockets = Array.from(io.sockets.sockets).map(socket => socket[0]);
  //const usersIDs = (await io.fetchSockets()).map(socket => socket.id);
  const players = (await io.fetchSockets()).map(socket => socket.player);
  const playerhasInfo = players.filter(player => player != undefined)
  return playerhasInfo
}

const randomRoomNameGenerator = ()=>{
  const randomValues = ['q','w','e','r','t','y','u','i','o','p','a','s','d','f','g','h','j','k','l','z','x','c','v','b','n','_','1','2','3','4','5','6','7','8','9','0','!','@','*']
  let roomID = ""
  for (let i = 0; i < 16; i++) {
    roomID += randomValues[Math.floor(Math.random()*40)] 
  }
  return roomID
}

io.on('connection' , (socket)=>{
  socket.on('disconnect' , ()=>{
    if(socket.player){
      if(socket.player?.playerState){     
        if(socket.player.room){
          socket.leave(socket.player.room.roomID)
          socket.to(socket.player.room.roomID).emit('player-disconnected-room')        
        }      
      }  
    }   
  })

  //------------------Game Entry and connecting the tow players----------------//
  //register user information
  socket.on('user-info' , (userInfo)=>{
    socket.player = userInfo
    socket.player.socketID = socket.id
    socket.emit('get-user-socket-id' , socket.id)
  })

  //register room information
  socket.on('room-info' , (roomInfo)=>{
    socket.player.room = roomInfo
  })
  
  //start game
  socket.on('start-room' ,async (roomID , targetPlayerID)=>{
    socket.join(roomID) 
    socket.player.playerState = 'busy'
    socket.to(targetPlayerID).emit('guest-player-started-room')

    const players = await getAllConnectedPlayers()
    const availablePlayers = players.filter(player => player.playerState == 'available' && player.socketID != socket.id)    
    const rooms = availablePlayers.filter(player=> player.room != undefined)        
    socket.broadcast.emit('recieve-all-users' , availablePlayers , rooms)
  })

  //-------------------------------
  socket.on('check-if-room-exist' ,async (roomID)=>{
    const players = await getAllConnectedPlayers()
    const availablePlayers = players.filter(player => player.playerState == 'available' && player.socketID != socket.id)   
    const targetPlayer = availablePlayers.find(player=> player.room?.roomID == roomID)
    //the target player is including the target room
    if(targetPlayer){
      socket.emit('room-exist-success' , targetPlayer.socketID)
    }else{
      socket.emit('room-exist-failed')
    }
  })
  //-------------------------------

  //send request to another player as a notification to play with 
  socket.on('join-room-request-note' , (player)=>{
    const message = `player ${player.name} wants to join your game room to play`
    socket.emit('play-request-note' , message)    
  })

  socket.on('accept-sender-request-to-join-his-room', async ({note , roomID} , targetPlayerID)=>{
    socket.join(roomID)
    socket.player.playerState = 'busy'
    socket.to(targetPlayerID).emit('accept-sender-request-to-join-his-room' , note)

    const players = await getAllConnectedPlayers()
    const availablePlayers = players.filter(player => player.playerState == 'available' && player.socketID != socket.id) 
    const rooms = availablePlayers.filter(player=> player.room != undefined)       
    socket.broadcast.emit('recieve-all-users' , availablePlayers , rooms)
  })

  socket.on('accept-sender-request-to-join-my-room' ,async (player , targetPlayerID)=>{
    socket.join(player.room.roomID)
    socket.player.playerState = 'busy'
    socket.to(targetPlayerID).emit('accept-sender-request-to-join-my-room' , player)

    const players = await getAllConnectedPlayers()
    const availablePlayers = players.filter(player => player.playerState == 'available' && player.socketID != socket.id)  
    const rooms = availablePlayers.filter(player=> player.room != undefined)   
    socket.broadcast.emit('recieve-all-users' , availablePlayers , rooms)
  })

  //send request to another player as a notification to play with 
  socket.on('play-request-note' , (note , targetPlayerID)=>{
    socket.to(targetPlayerID).emit('play-request-note' , note)
  })
  
  //after the wating counter finish and the player did not act with
  //the notification sened this note must close
  socket.on('cancel-join-request-note',(targetNote)=>{
   socket.to(targetNote.targetPlayerID).emit('cancel-join-request-note' ,targetNote)
  })

  //refuse play request
  socket.on('refuse-play-request-note' , (playerID)=>{
    socket.to(playerID).emit('refuse-play-request-note' , playerID)
  })

  //get the target room information
  socket.on('get-room-info' ,async (roomID)=>{
    const players = (await io.fetchSockets()).map(socket => socket.player);
    const targetPlayer = players.find(player=>{
      if(player?.room){
        return player.room.roomID==roomID
      }
     }
    )
    //the target player is including the target room
    socket.emit('recieve-room-info' , targetPlayer)
  })

  //for all available players (connected players)
  socket.on('get-all-users' ,async ()=>{
    const players = await getAllConnectedPlayers()
    const availablePlayers = players.filter(player => player.playerState == 'available' && player.socketID != socket.id)     
    socket.emit('recieve-all-users' , availablePlayers)
  })
  
  //for all available rooms
  socket.on('get-all-rooms' ,async ()=>{
    const players = await getAllConnectedPlayers()
    const availablePlayers = players.filter(player => player.playerState == 'available' && player.socketID != socket.id)     
    const rooms = availablePlayers.filter(player=> player.room != undefined)
    socket.emit('recieve-all-rooms' , rooms)
  })

  //close the room
  socket.on('close-room' ,async ()=>{
    socket.player.room = undefined
    const players = await getAllConnectedPlayers()
    const availablePlayers = players.filter(player => player.playerState == 'available' && player.socketID != socket.id)     
    const rooms = availablePlayers.filter(player=> player.room != undefined)
    socket.broadcast.emit('recieve-all-rooms' , rooms)
  })
  //

  //search for random room 
  socket.on('random-room-search-for-player' ,async (randomPlayer)=>{  
    //finding the random player who search for player
    const players = await getAllConnectedPlayers()
    const availablePlayers = players.filter(player => player.playerState == 'available' && player.socketID != socket.id)     
    let availablePlayersSearchingForPlayer = availablePlayers.filter(player=>player?.randomRoom == true)
    //
    
    //thats mean there is a player searching for a random player to play with
    if(availablePlayersSearchingForPlayer.length != 0){
      //generate random room name and it must be unique 
      let randomRoomID = randomRoomNameGenerator()
      let roomNotFound = false
      while (!roomNotFound) {
        const targetPlayer = availablePlayers.find(player=> player.room?.roomID == randomRoomID)
        if(!targetPlayer){
          roomNotFound = true
        }else{
          randomRoomID = randomRoomNameGenerator()
        }
      }
      //

      //register room information
      socket.player.room = {
        roomID : randomRoomID,
        inputType:"",
        roomRounds:3
      }
      //
      
      //join this socket to the random room
      socket.join(randomRoomID)
      //

      //emit to the other player and give him the information about the guest player 
      //and the room name
      socket.to(availablePlayersSearchingForPlayer[0].socketID)
        .emit('random-room-second-player-found',randomPlayer , randomRoomID)
      //
    }

    //if there are no players searching for random room right now
    //so this socket will be the first one
    if(availablePlayersSearchingForPlayer.length == 0){      
      socket.player.randomRoom = true
    }     
    //
  })
  //start random room
  socket.on('random-room-start-room' ,async (randomPlayer,randomRoomID)=>{
    //cancel searching process for this socket because he already found the 
    //random player
    socket.player.randomRoom = undefined
    //

    //register room information
    socket.player.room = {
      roomID : randomRoomID,
      inputType:"",
      roomRounds:3
    }
    //

    //join this socket to the random room
    socket.join(randomRoomID)
    //

    //emit to the other player and give him the information about the guest player 
    //and the room name
    socket.to(randomRoomID).emit('random-player-started-room',randomRoomID ,randomPlayer)
    //
  })
  //cancel searching process
  socket.on('random-room-stop-search-for-player' , ()=>{
    socket.player.randomRoom = undefined
  })
  //-------------------------------------------------------------------

  //------------------the game itself and chating----------------//
  //*******room dashboard page****** */
  socket.on('room-is-busy-now' , (playerID)=>{
    socket.to(playerID).emit('room-is-busy-now')
  })

  //******Chating*********
  socket.on('send-message' , (message , roomID)=>{
   socket.to(roomID).emit('recieve-message' , message)
  })
  socket.on('chat-guest-player-typing-message-start' , (roomID)=>{
    socket.to(roomID).emit('chat-guest-player-typing-message-start')
  })
  socket.on('chat-guest-player-typing-message-stop' , (roomID)=>{
    socket.to(roomID).emit('chat-guest-player-typing-message-stop')
  })
  //

  //*****Game Logic**********/  
  socket.on('send-playing-inputType', (info,roomID)=>{
    socket.to(roomID).emit('send-playing-inputType' , info )
  })
  socket.on('update-game-logic' , (states , roomID)=>{
    socket.to(roomID).emit('update-game-logic' , states )
  })

  //play again
  socket.on('player-wants-to-play-agian', (roomID , mainReady)=>{
   socket.to(roomID).emit('player-wants-to-play-agian' , mainReady)
  })
  socket.on('change-rounds', (selectedRound , roomID)=>{
   socket.to(roomID).emit('change-rounds' , selectedRound )
  })
  socket.on('change-inputType', (selectedInputType , roomID)=>{
   socket.to(roomID).emit('change-inputType' , selectedInputType )
  })
  socket.on('switch-player', (selectedIdentity,playerTypeSelected , roomID)=>{
    socket.to(roomID).emit('switch-player' , selectedIdentity,playerTypeSelected)
  })

  //player ready process
  socket.on('player-ready-to-play-again' , (roomID , roomInfo)=>{
    socket.to(roomID).emit('player-ready-to-play-again' , roomInfo)
  })
  socket.on('player-not-ready-to-play-again' , (roomID)=>{
    socket.to(roomID).emit('player-not-ready-to-play-again')
  })
  //
                         
  //leave the room
  socket.on('leave-room' , (roomID , playerID)=>{
   socket.player.room = undefined
   socket.player.playerState = 'available'
   socket.leave(roomID)  
   socket.to(roomID).emit('leave-room')   
  })
  //the other player must leave room as well
  socket.on('second-player-leave-room' , (roomID)=>{
    socket.leave(roomID)
  })
  //
  //-------------------------------------------------------------------
})


app.get('/' , (req , res)=>{
  res.sendFile('index.html')
})

server.listen(process.env.PORT , ()=>{
  console.log('server is running in port ' + process.env.PORT);
})